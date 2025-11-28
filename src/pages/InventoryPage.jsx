// src/pages/InventoryPage.jsx
import { formatNumber } from '../utils/numberUtils';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, orderBy, Timestamp, getDocs, limit, startAfter } from 'firebase/firestore'; 
import { toast } from 'react-toastify';
import InventoryFilters from '../components/InventoryFilters';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';
import { FiChevronLeft, FiChevronRight, FiPrinter } from 'react-icons/fi';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import { useRealtimeNotification } from '../hooks/useRealtimeNotification';
import NewDataNotification from '../components/NewDataNotification';
import { PAGE_SIZE } from '../constants';
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';
import { fuzzyNormalize } from '../utils/stringUtils'; 
import HighlightText from '../components/HighlightText'; 

// --- HÀM CHUẨN HÓA CHUỖI ---
const localFuzzyNormalize = (str) => {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") 
        .replace(/\s+/g, ""); 
};

const InventoryPage = ({ pageTitle }) => {
    const { role: userRole } = useAuth();
    const [filters, setFilters] = useState({ team: 'all', dateStatus: 'all', subGroup: 'all' });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRowId, setSelectedRowId] = useState(null);

    // --- STATE CHO TÌM KIẾM ---
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    
    // --- STATE CACHE ---
    const [allProductsCache, setAllProductsCache] = useState([]);

    // --- 1. TẢI CACHE (Chạy 1 lần) ---
    useEffect(() => {
        const fetchCache = async () => {
            try {
                const q = query(collection(db, 'products'));
                const snapshot = await getDocs(q);
                const cache = snapshot.docs.map(doc => ({
                    id: doc.id,
                    normName: localFuzzyNormalize(doc.data().productName || ''),
                    normId: localFuzzyNormalize(doc.id)
                }));
                setAllProductsCache(cache);
            } catch (err) {
                console.error("Lỗi tải cache sản phẩm:", err);
            }
        };
        fetchCache();
    }, []);

    // --- 2. HÀM TÌM KIẾM KÉP ---
    const performSearch = useCallback(async (term) => {
        if (!term) {
            setIsSearching(false);
            setSearchResults([]);
            return;
        }
        
        setIsSearching(true); 

        try {
            const rawTerm = term.trim().toUpperCase();

            // --- A. TÌM KIẾM ID DỰA TRÊN TÊN HÀNG (CACHE) ---
            const searchKey = localFuzzyNormalize(term);
            const matchedProducts = allProductsCache.filter(p => 
                p.normName.includes(searchKey) || p.normId.includes(searchKey)
            );
            const productIdsFromCache = matchedProducts.map(p => p.id);

            // --- B. CHUẨN BỊ QUERY FIRESTORE ---
            const lotsRef = collection(db, "inventory_lots");
            const constraints = [where("quantityRemaining", ">", 0)];

            if (userRole === 'med') constraints.push(where("team", "==", "MED"));
            else if (userRole === 'bio') constraints.push(where("team", "in", ["BIO", "Spare Part"]));

            if (filters.team !== 'all') constraints.push(where("team", "==", filters.team));
            if (filters.subGroup && filters.subGroup !== 'all') constraints.push(where("subGroup", "==", filters.subGroup));

            const queryPromises = [];

            // 1. Query các lô thuộc về Sản phẩm tìm thấy trong Cache
            if (productIdsFromCache.length > 0) {
                const chunks = [];
                const idsToQuery = productIdsFromCache.slice(0, 60); 
                while (idsToQuery.length > 0) chunks.push(idsToQuery.splice(0, 30));
                
                chunks.forEach(chunk => {
                    queryPromises.push(getDocs(query(lotsRef, ...constraints, where('productId', 'in', chunk))));
                });
            }

            // 2. Query trực tiếp Mã hàng & Số lô
            const searchTerms = [rawTerm];
            if (!rawTerm.includes('-') && rawTerm.length > 2) searchTerms.push(rawTerm.slice(0, 2) + '-' + rawTerm.slice(2));
            if (rawTerm.includes('-')) searchTerms.push(rawTerm.replace(/-/g, ''));

            searchTerms.forEach(t => {
                // Mã hàng
                queryPromises.push(getDocs(query(lotsRef, ...constraints, where('productId', '>=', t), where('productId', '<=', t + '\uf8ff'), limit(50))));
                // Số lô
                if (t === rawTerm) {
                    queryPromises.push(getDocs(query(lotsRef, ...constraints, where('lotNumber', '>=', t), where('lotNumber', '<=', t + '\uf8ff'), limit(50))));
                }
            });

            const snapshots = await Promise.all(queryPromises);

            // --- C. GỘP KẾT QUẢ ---
            const mergedMap = new Map();
            snapshots.forEach(snap => {
                snap.docs.forEach(doc => {
                    mergedMap.set(doc.id, { id: doc.id, ...doc.data() });
                });
            });

            const results = Array.from(mergedMap.values());

            // --- D. SẮP XẾP ---
            results.sort((a, b) => {
                // Ưu tiên Mã hàng chính xác
                if (a.productId === rawTerm && b.productId !== rawTerm) return -1;
                if (b.productId === rawTerm && a.productId !== rawTerm) return 1;
                // Ưu tiên FEFO
                const dateA = a.expiryDate ? a.expiryDate.toDate().getTime() : Infinity;
                const dateB = b.expiryDate ? b.expiryDate.toDate().getTime() : Infinity;
                if (dateA !== dateB) return dateA - dateB;
                return a.quantityRemaining - b.quantityRemaining;
            });

            setSearchResults(results);

        } catch (error) {
            console.error("Lỗi tìm kiếm:", error);
            toast.error("Đã xảy ra lỗi khi tìm kiếm.");
        }
    }, [userRole, filters, allProductsCache]);

    // --- useEffect debounce ---
    useEffect(() => {
        const debounce = setTimeout(() => {
            if (searchTerm) {
                performSearch(searchTerm);
            } else {
                setIsSearching(false);
                setSearchResults([]);
            }
        }, 500);
        return () => clearTimeout(debounce);
    }, [searchTerm, performSearch]);

    // --- BASE QUERY ---
    const baseQuery = useMemo(() => {
        if (searchTerm) {
            return null; 
        }
        
        const baseCollection = collection(db, "inventory_lots");
        let constraints = [where("quantityRemaining", ">", 0)];

        if (userRole === 'med') constraints.push(where("team", "==", "MED"));
        else if (userRole === 'bio') constraints.push(where("team", "==", "BIO"));
        
        if (filters.team !== 'all') constraints.push(where("team", "==", filters.team));
        if (filters.subGroup && filters.subGroup !== 'all') constraints.push(where("subGroup", "==", filters.subGroup));
        
        if (filters.dateStatus === 'expired') {
            constraints.push(where("expiryDate", "<", Timestamp.now()));
            constraints.push(orderBy("expiryDate", "desc"));
            constraints.push(orderBy("productId", "asc")); 
        } else if (filters.dateStatus === 'near_expiry') {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 210);
            constraints.push(where("expiryDate", ">=", Timestamp.now()));
            constraints.push(where("expiryDate", "<=", Timestamp.fromDate(futureDate)));
            constraints.push(orderBy("expiryDate", "asc")); 
            constraints.push(orderBy("quantityRemaining", "asc"));
        } else {
            constraints.push(orderBy("productId", "asc"), orderBy("importDate", "asc"));
        }

        return query(baseCollection, ...constraints);
    }, [userRole, filters, searchTerm]);

    const {
        documents: inventory,
        loading,
        isLastPage,
        page,
        nextPage,
        prevPage,
        reset
    } = useFirestorePagination(baseQuery, PAGE_SIZE);

    const { hasNewData, dismissNewData } = useRealtimeNotification(baseQuery);

    const dataToDisplay = useMemo(() => {
        if (isSearching) {
            return searchResults;
        }
        if (filters.dateStatus === 'near_expiry') {
            return inventory.filter(lot => {
                const colorClass = getRowColorByExpiry(lot.expiryDate, lot.subGroup);
                return colorClass.includes('near-expiry') || colorClass.includes('expired');
            });
        }
        return inventory;
    }, [isSearching, searchResults, inventory, filters.dateStatus]);

    const handleRefresh = () => {
        dismissNewData();
        reset();
    };

    const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
    };

    const handleRowClick = (lotId) => {
        setSelectedRowId(prevId => (prevId === lotId ? null : lotId));
    };

    return (
       <div className="printable-inventory-area">

            <NewDataNotification
              isVisible={hasNewData}
              onRefresh={handleRefresh}
              message="Có cập nhật tồn kho mới!"
            />
            
            <div className="controls-container">
                <InventoryFilters 
                    userRole={userRole} 
                    onFilterChange={handleFilterChange} 
                    activeFilters={filters}
                />
                <div className="search-container">
                     <input
                        type="text"
                        placeholder="Tìm theo Tên, Mã hàng hoặc Số lô..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            {loading && !isSearching ? <Spinner /> : (
                <>
                    <div className="table-container">
                        <table className="inventory-table">
                            <thead>
                                <tr>
                                    {/* --- TIÊU ĐỀ CỘT (Đúng thứ tự) --- */}
                                    <th>Ngày nhập</th>
                                    <th>Mã hàng</th>
                                    <th>Tên hàng</th>
                                    <th>Số lô</th>
                                    <th>HSD</th>
                                    <th>ĐVT</th>
                                    <th>Quy cách</th>
                                    <th>SL Nhập</th>
                                    <th>SL Còn lại</th>
                                    <th>Ghi chú</th>
                                    <th>Nhiệt độ BQ</th>
                                    <th>Hãng sản xuất</th>
                                    <th>Nhóm Hàng</th>
                                    <th>Team</th>
                                </tr>
                            </thead>
                            <tbody className="inventory-table-body">
                                {dataToDisplay.length > 0 ? (
                                    dataToDisplay.map(lot => (
                                        <tr 
                                            key={lot.id} 
                                            onClick={() => handleRowClick(lot.id)}
                                            className={`${selectedRowId === lot.id ? 'selected-row' : ''} ${getRowColorByExpiry(lot.expiryDate, lot.subGroup)}`}
                                        >
                                            {/* --- DỮ LIỆU (Đã sắp xếp lại khớp với Tiêu đề) --- */}
                                            
                                            {/* 1. Ngày nhập */}
                                            <td data-label="Ngày nhập">{formatDate(lot.importDate)}</td>
                                            
                                            {/* 2. Mã hàng */}
                                            <td data-label="Mã hàng"><strong><HighlightText text={lot.productId} highlight={searchTerm} /></strong></td>
                                            
                                            {/* 3. Tên hàng */}
                                            <td data-label="Tên hàng"><HighlightText text={lot.productName} highlight={searchTerm} /></td>
                                            
                                            {/* 4. Số lô */}
                                            <td data-label="Số lô"><HighlightText text={lot.lotNumber || '(Không có)'} highlight={searchTerm} /></td>
                                            
                                            {/* 5. HSD */}
                                            <td data-label="HSD">{lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'}</td>
                                            
                                            {/* 6. ĐVT */}
                                            <td data-label="ĐVT">{lot.unit}</td>
                                            
                                            {/* 7. Quy cách */}
                                            <td data-label="Quy cách">{lot.packaging}</td>
                                            
                                            {/* 8. SL Nhập */}
                                            <td data-label="SL Nhập">{formatNumber(lot.quantityImported)}</td>
                                            
                                            {/* 9. SL Còn lại */}
                                            <td data-label="SL Còn lại">{formatNumber(lot.quantityRemaining)}</td>
                                            
                                            {/* 10. Ghi chú */}
                                            <td data-label="Ghi chú">{lot.notes}</td>
                                            
                                            {/* 11. Nhiệt độ BQ */}
                                            <td data-label="Nhiệt độ BQ"><TempBadge temperature={lot.storageTemp} /></td>
                                            
                                            {/* 12. Hãng SX */}
                                            <td data-label="Hãng sản xuất">{lot.manufacturer}</td>
                                            
                                            {/* 13. Nhóm Hàng */}
                                            <td data-label="Nhóm Hàng">{lot.subGroup}</td>
                                            
                                            {/* 14. Team */}
                                            <td data-label="Team"><TeamBadge team={lot.team} /></td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="14" style={{textAlign: 'center', padding: '20px'}}>
                                            {isSearching ? 'Không tìm thấy kết quả phù hợp.' : 'Chưa có dữ liệu.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {!isSearching && (
                        <div className="pagination-controls">
                            <button onClick={prevPage} disabled={page <= 1 || loading}>
                                <FiChevronLeft /> Trang Trước
                            </button>
                            <span>Trang {page}</span>
                            <button onClick={nextPage} disabled={isLastPage || loading}>
                                Trang Tiếp <FiChevronRight />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default InventoryPage;