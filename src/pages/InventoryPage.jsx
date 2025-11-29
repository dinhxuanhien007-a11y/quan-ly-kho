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
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import { useRealtimeNotification } from '../hooks/useRealtimeNotification';
import NewDataNotification from '../components/NewDataNotification';
import { PAGE_SIZE } from '../constants';
import { formatDate, getRowColorByExpiry, calculateLifePercentage } from '../utils/dateUtils';
import HighlightText from '../components/HighlightText'; 
// --- IMPORT MỚI ---
import Skeleton, { SkeletonTheme } from 'react-loading-skeleton';
import 'react-loading-skeleton/dist/skeleton.css';
import EmptyState from '../components/EmptyState';

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

    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [allProductsCache, setAllProductsCache] = useState([]);

    // --- 1. TẢI CACHE ---
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

    // --- 2. HÀM TÌM KIẾM ---
    const performSearch = useCallback(async (term) => {
        if (!term) {
            setIsSearching(false);
            setSearchResults([]);
            return;
        }
        
        setIsSearching(true); 

        try {
            const rawTerm = term.trim().toUpperCase();
            const searchKey = localFuzzyNormalize(term);
            const matchedProducts = allProductsCache.filter(p => 
                p.normName.includes(searchKey) || p.normId.includes(searchKey)
            );
            const productIdsFromCache = matchedProducts.map(p => p.id);

            const lotsRef = collection(db, "inventory_lots");
            const constraints = [where("quantityRemaining", ">", 0)];

            if (userRole === 'med') constraints.push(where("team", "==", "MED"));
            else if (userRole === 'bio') constraints.push(where("team", "in", ["BIO", "Spare Part"]));

            if (filters.team !== 'all') constraints.push(where("team", "==", filters.team));
            if (filters.subGroup && filters.subGroup !== 'all') constraints.push(where("subGroup", "==", filters.subGroup));

            const queryPromises = [];

            if (productIdsFromCache.length > 0) {
                const chunks = [];
                const idsToQuery = productIdsFromCache.slice(0, 60); 
                while (idsToQuery.length > 0) chunks.push(idsToQuery.splice(0, 30));
                
                chunks.forEach(chunk => {
                    queryPromises.push(getDocs(query(lotsRef, ...constraints, where('productId', 'in', chunk))));
                });
            }

            const searchTerms = [rawTerm];
            if (!rawTerm.includes('-') && rawTerm.length > 2) searchTerms.push(rawTerm.slice(0, 2) + '-' + rawTerm.slice(2));
            if (rawTerm.includes('-')) searchTerms.push(rawTerm.replace(/-/g, ''));

            searchTerms.forEach(t => {
                queryPromises.push(getDocs(query(lotsRef, ...constraints, where('productId', '>=', t), where('productId', '<=', t + '\uf8ff'), limit(50))));
                if (t === rawTerm) {
                    queryPromises.push(getDocs(query(lotsRef, ...constraints, where('lotNumber', '>=', t), where('lotNumber', '<=', t + '\uf8ff'), limit(50))));
                }
            });

            const snapshots = await Promise.all(queryPromises);
            const mergedMap = new Map();
            snapshots.forEach(snap => {
                snap.docs.forEach(doc => {
                    mergedMap.set(doc.id, { id: doc.id, ...doc.data() });
                });
            });

            const results = Array.from(mergedMap.values());
            results.sort((a, b) => {
                if (a.productId === rawTerm && b.productId !== rawTerm) return -1;
                if (b.productId === rawTerm && a.productId !== rawTerm) return 1;
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

    const baseQuery = useMemo(() => {
        if (searchTerm) return null; 
        
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
        if (isSearching) return searchResults;
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

    // --- RENDER SKELETON (HIỆU ỨNG LOADING) ---
    const renderSkeleton = () => {
        return Array(10).fill(0).map((_, index) => (
            <tr key={`skeleton-${index}`}>
                <td><Skeleton width={80} /></td>
                <td><Skeleton width={100} /></td>
                <td><Skeleton width={200} /></td>
                <td><Skeleton width={80} /></td>
                <td><Skeleton width={80} /></td>
                <td><Skeleton width={50} /></td>
                <td><Skeleton width={120} /></td>
                <td><Skeleton width={50} /></td>
                <td><Skeleton width={50} /></td>
                <td><Skeleton width={100} /></td>
                <td><Skeleton width={80} /></td>
                <td><Skeleton width={100} /></td>
                <td><Skeleton width={80} /></td>
                <td><Skeleton width={50} /></td>
            </tr>
        ));
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

            <div className="table-container">
                <table className="inventory-table">
                    <thead>
                        <tr>
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
                        {/* --- TRƯỜNG HỢP 1: ĐANG LOADING --- */}
                        {loading && !isSearching ? (
                            <SkeletonTheme baseColor="#f3f3f3" highlightColor="#ecebeb">
                                {renderSkeleton()}
                            </SkeletonTheme>
                        ) : (
                            /* --- TRƯỜNG HỢP 2: CÓ DỮ LIỆU --- */
                            dataToDisplay.length > 0 ? (
                                dataToDisplay.map(lot => (
                                    <tr 
                                        key={lot.id} 
                                        onClick={() => handleRowClick(lot.id)}
                                        className={`${selectedRowId === lot.id ? 'selected-row' : ''} ${getRowColorByExpiry(lot.expiryDate, lot.subGroup)}`}
                                    >
                                        <td data-label="Ngày nhập">{formatDate(lot.importDate)}</td>
                                        <td data-label="Mã hàng"><strong><HighlightText text={lot.productId} highlight={searchTerm} /></strong></td>
                                        <td data-label="Tên hàng"><HighlightText text={lot.productName} highlight={searchTerm} /></td>
                                        <td data-label="Số lô"><HighlightText text={lot.lotNumber || '(Không có)'} highlight={searchTerm} /></td>
                                        {/* --- THAY THẾ CỘT HSD BẰNG ĐOẠN NÀY --- */}
                                            <td data-label="HSD">
                                                <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                    {/* Ngày tháng */}
                                                    <span style={{ marginBottom: '4px' }}>
                                                        {lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'}
                                                    </span>
                                                    
                                                    {/* Thanh tuổi thọ (chỉ hiện nếu có HSD) */}
                                                    {lot.expiryDate && (
                                                        <div style={{ 
                                                            width: '100%', 
                                                            height: '6px', 
                                                            backgroundColor: '#e9ecef', 
                                                            borderRadius: '3px',
                                                            overflow: 'hidden' 
                                                        }}>
                                                            <div style={{
                                                                width: `${calculateLifePercentage(lot.expiryDate)}%`,
                                                                height: '100%',
                                                                borderRadius: '3px',
                                                                // Logic màu sắc: >50% Xanh, >20% Vàng, <20% Đỏ
                                                                backgroundColor: calculateLifePercentage(lot.expiryDate) > 50 
                                                                    ? '#28a745' 
                                                                    : (calculateLifePercentage(lot.expiryDate) > 20 ? '#ffc107' : '#dc3545'),
                                                                transition: 'width 0.5s ease'
                                                            }}></div>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            {/* -------------------------------------- */}
                                        <td data-label="ĐVT">{lot.unit}</td>
                                        <td data-label="Quy cách">{lot.packaging}</td>
                                        <td data-label="SL Nhập">{formatNumber(lot.quantityImported)}</td>
                                        <td data-label="SL Còn lại">{formatNumber(lot.quantityRemaining)}</td>
                                        <td data-label="Ghi chú">{lot.notes}</td>
                                        <td data-label="Nhiệt độ BQ"><TempBadge temperature={lot.storageTemp} /></td>
                                        <td data-label="Hãng sản xuất">{lot.manufacturer}</td>
                                        <td data-label="Nhóm Hàng">{lot.subGroup}</td>
                                        <td data-label="Team"><TeamBadge team={lot.team} /></td>
                                    </tr>
                                ))
                            ) : (
                                /* --- TRƯỜNG HỢP 3: KHÔNG CÓ DỮ LIỆU (EMPTY STATE) --- */
                                <tr>
                                    <td colSpan="14">
                                        <EmptyState 
                                            message={isSearching ? `Không tìm thấy kết quả cho "${searchTerm}"` : 'Chưa có dữ liệu tồn kho.'} 
                                            isSearch={isSearching}
                                        />
                                    </td>
                                </tr>
                            )
                        )}
                    </tbody>
                </table>
            </div>
            
            {!isSearching && !loading && dataToDisplay.length > 0 && (
                <div className="pagination-controls">
                    <button onClick={prevPage} disabled={page <= 1}>
                        <FiChevronLeft /> Trang Trước
                    </button>
                    <span>Trang {page}</span>
                    <button onClick={nextPage} disabled={isLastPage}>
                        Trang Tiếp <FiChevronRight />
                    </button>
                </div>
            )}
        </div>
    );
};

export default InventoryPage;