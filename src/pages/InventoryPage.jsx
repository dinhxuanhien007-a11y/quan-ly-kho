// src/pages/InventoryPage.jsx
import { formatNumber } from '../utils/numberUtils';
import React, { useState, useMemo, useEffect } from 'react';
import { db } from '../firebaseConfig';
// <-- THAY ĐỔI 1: Thêm getDocs, limit vào import
import { collection, query, where, orderBy, Timestamp, getDocs, limit } from 'firebase/firestore'; 
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

const InventoryPage = ({ pageTitle }) => {
    const { role: userRole } = useAuth();
    const [filters, setFilters] = useState({ team: 'all', dateStatus: 'all', subGroup: 'all' });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRowId, setSelectedRowId] = useState(null);

    // --- THÊM MỚI: State cho tìm kiếm ---
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState([]);

    // --- HÀM TÌM KIẾM KÉP (MÃ HÀNG + SỐ LÔ) ---
    const performSearch = async (term) => {
        if (!term) {
            setIsSearching(false);
            setSearchResults([]);
            return;
        }
        
        setIsSearching(true); 
        // Lưu ý: Ta có thể dùng biến loading riêng, nhưng ở đây tận dụng biến loading của hook hoặc chấp nhận UI update ngay

        try {
            const trimmedTerm = term.trim().toUpperCase();
            const lotsRef = collection(db, "inventory_lots");
            
            // Xây dựng điều kiện lọc cơ bản (Role, Team, SubGroup)
            // Lưu ý: Logic này phải khớp với baseQuery bên dưới để kết quả nhất quán
            const constraints = [where("quantityRemaining", ">", 0)];

            if (userRole === 'med') constraints.push(where("team", "==", "MED"));
            else if (userRole === 'bio') constraints.push(where("team", "==", "BIO"));

            if (filters.team !== 'all') constraints.push(where("team", "==", filters.team));
            if (filters.subGroup && filters.subGroup !== 'all') constraints.push(where("subGroup", "==", filters.subGroup));

            // 1. Tìm theo Mã hàng (Prefix search)
            const q1 = query(lotsRef, ...constraints, 
                where('productId', '>=', trimmedTerm),
                where('productId', '<=', trimmedTerm + '\uf8ff'),
                limit(50)
            );

            // 2. Tìm theo Số lô (Prefix search)
            const q2 = query(lotsRef, ...constraints,
                where('lotNumber', '>=', trimmedTerm),
                where('lotNumber', '<=', trimmedTerm + '\uf8ff'),
                limit(50)
            );

            // Chạy song song 2 truy vấn
            const [snap1, snap2] = await Promise.all([getDocs(q1), getDocs(q2)]);

            // Gộp kết quả và loại bỏ trùng lặp bằng Map (dựa vào ID document)
            const mergedMap = new Map();
            
            [...snap1.docs, ...snap2.docs].forEach(doc => {
                mergedMap.set(doc.id, { id: doc.id, ...doc.data() });
            });

            const results = Array.from(mergedMap.values());

            // Sắp xếp kết quả (Ưu tiên HSD gần nhất - FEFO)
            results.sort((a, b) => {
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
    };

    // --- useEffect xử lý debounce cho tìm kiếm ---
    useEffect(() => {
        const debounce = setTimeout(() => {
            if (searchTerm) {
                performSearch(searchTerm);
            } else {
                setIsSearching(false);
                setSearchResults([]);
                // Reset về trang 1 khi xóa tìm kiếm để hook pagination hoạt động lại đúng
                // (Hook useFirestorePagination sẽ tự động chạy lại khi query thay đổi)
            }
        }, 500);
        return () => clearTimeout(debounce);
    }, [searchTerm, filters]); // Thêm filters vào để tìm kiếm lại khi đổi bộ lọc

    const baseQuery = useMemo(() => {
        // --- THAY ĐỔI QUAN TRỌNG: Nếu đang có từ khóa tìm kiếm, trả về NULL để hook pagination tạm dừng ---
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
            // Mặc định
            constraints.push(orderBy("productId", "asc"), orderBy("importDate", "asc"));
        }

        return query(baseCollection, ...constraints);
    }, [userRole, filters, searchTerm]); // Thêm searchTerm vào dependency

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

    // --- XÁC ĐỊNH NGUỒN DỮ LIỆU ĐỂ HIỂN THỊ ---
    const dataToDisplay = useMemo(() => {
        // 1. Nếu đang tìm kiếm -> Dùng searchResults
        if (isSearching) {
            return searchResults;
        }
        
        // 2. Nếu không tìm kiếm -> Dùng inventory từ hook phân trang
        // (Áp dụng thêm logic lọc màu sắc nếu đang ở tab Cận date - logic cũ của bạn)
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
                        placeholder="Tìm theo Mã hàng hoặc Số lô..." // Cập nhật placeholder
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
                                            <td data-label="Ngày nhập">{formatDate(lot.importDate)}</td>
                                            <td data-label="Mã hàng">{lot.productId}</td>
                                            <td data-label="Tên hàng">{lot.productName}</td>
                                            <td data-label="Số lô">{lot.lotNumber || '(Không có)'}</td>
                                            <td data-label="HSD">{lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'}</td>
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
                                    <tr>
                                        <td colSpan="14" style={{textAlign: 'center', padding: '20px'}}>
                                            {isSearching ? 'Không tìm thấy kết quả phù hợp.' : 'Chưa có dữ liệu.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    
                    {/* Chỉ hiện phân trang khi KHÔNG tìm kiếm */}
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