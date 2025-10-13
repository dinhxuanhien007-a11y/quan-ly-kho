// src/pages/InventoryPage.jsx
import { formatNumber } from '../utils/numberUtils';
import React, { useState, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, orderBy, Timestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';
import InventoryFilters from '../components/InventoryFilters';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';
import { FiChevronLeft, FiChevronRight, FiPrinter } from 'react-icons/fi';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import { useRealtimeNotification } from '../hooks/useRealtimeNotification'; // <-- THÊM DÒNG NÀY
import NewDataNotification from '../components/NewDataNotification'; // <-- THÊM DÒNG NÀY
import { PAGE_SIZE } from '../constants';

// <-- THAY ĐỔI 1: Import thêm hàm getRowColorByExpiry
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';

// <-- THAY ĐỔI 2: Xóa toàn bộ hàm getRowColorByExpiry ở đây

const InventoryPage = ({ pageTitle }) => {
    const { role: userRole } = useAuth();
    const [filters, setFilters] = useState({ team: 'all', dateStatus: 'all', subGroup: 'all' });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRowId, setSelectedRowId] = useState(null);

 // src/pages/InventoryPage.jsx

const baseQuery = useMemo(() => {
    const baseCollection = collection(db, "inventory_lots");
    let constraints = [where("quantityRemaining", ">", 0)];

    // --- Logic lọc theo vai trò và các bộ lọc khác (giữ nguyên) ---
    if (userRole === 'med') {
        constraints.push(where("team", "==", "MED"));
    } else if (userRole === 'bio') {
        constraints.push(where("team", "==", "BIO"));
    }

    if (filters.team !== 'all') {
        constraints.push(where("team", "==", filters.team));
    }
    if (filters.subGroup && filters.subGroup !== 'all') {
        constraints.push(where("subGroup", "==", filters.subGroup));
    }

    // --- Logic sắp xếp đã được sửa lỗi ---
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
        constraints.push(orderBy("quantityRemaining", "asc")); // Sửa ở đây
    } else if (searchTerm) {
        const upperSearchTerm = searchTerm.toUpperCase();
        constraints.push(where("productId", ">=", upperSearchTerm));
        constraints.push(where("productId", "<=", upperSearchTerm + '\uf8ff'));

        // SỬA LỖI TẠI ĐÂY: Thêm quy tắc sắp xếp FEFO khi tìm kiếm
        constraints.push(orderBy("productId", "asc"), orderBy("expiryDate", "asc"), orderBy("quantityRemaining", "asc"));

    } else {
        // Sắp xếp mặc định MỚI: Theo HSD gần nhất, sau đó là SL tồn ít hơn lên trước
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

    // src/pages/InventoryPage.jsx

const filteredInventory = useMemo(() => {
    if (filters.dateStatus !== 'near_expiry') {
        return inventory; // Trả về danh sách gốc nếu không lọc cận date
    }
    // Lọc lại danh sách đã lấy về từ server
    return inventory.filter(lot => {
        const colorClass = getRowColorByExpiry(lot.expiryDate, lot.subGroup);
        // Chỉ giữ lại những item nào thực sự có màu cảnh báo
        return colorClass.includes('near-expiry') || colorClass.includes('expired');
    });
}, [inventory, filters.dateStatus]);

    // <-- THÊM HÀM XỬ LÝ REFRESH NÀY
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
                        placeholder="Tìm theo Mã hàng..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            {loading ? <Spinner /> : (
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
    {filteredInventory.map(lot => (
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
                                ))}
                            </tbody>
                        </table>
                    </div>
             
                    <div className="pagination-controls">
                        <button onClick={prevPage} disabled={page <= 1 || loading}>
                            <FiChevronLeft /> Trang Trước
                        </button>
                        <span>Trang {page}</span>
                        <button onClick={nextPage} disabled={isLastPage || loading}>
                            Trang Tiếp <FiChevronRight />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default InventoryPage;
