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
import { PAGE_SIZE } from '../constants';

// <-- THAY ĐỔI 1: Import thêm hàm getRowColorByExpiry
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';

// <-- THAY ĐỔI 2: Xóa toàn bộ hàm getRowColorByExpiry ở đây

const InventoryPage = () => {
    const { userRole } = useAuth();
    const [filters, setFilters] = useState({ team: 'all', dateStatus: 'all' });
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRowId, setSelectedRowId] = useState(null);

    const baseQuery = useMemo(() => {
        let q = query(
            collection(db, "inventory_lots"),
            orderBy("productId", "asc"),
            orderBy("importDate", "asc")
        );

        if (userRole === 'med') {
            q = query(q, where("team", "==", "MED"));
        } else if (userRole === 'bio') {
            q = query(q, where("team", "in", ["BIO", "Spare Part"]));
        }

        if (filters.team !== 'all') {
            q = query(q, where("team", "==", filters.team));
        }

        if (filters.dateStatus === 'expired') {
            q = query(q, where("expiryDate", "<", Timestamp.now()));
        } else if (filters.dateStatus === 'near_expiry') {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 120);
            q = query(q, where("expiryDate", ">=", Timestamp.now()), where("expiryDate", "<=", Timestamp.fromDate(futureDate)));
        }
        
        if (searchTerm) {
            const upperSearchTerm = searchTerm.toUpperCase();
            q = query(q, where("productId", ">=", upperSearchTerm), where("productId", "<=", upperSearchTerm + '\uf8ff'));
        }
        return q;
    }, [userRole, filters, searchTerm]);

    const {
        documents: inventory,
        loading,
        isLastPage,
        page,
        nextPage,
        prevPage
    } = useFirestorePagination(baseQuery, PAGE_SIZE);

    const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
    };

    const handleRowClick = (lotId) => {
        setSelectedRowId(prevId => (prevId === lotId ? null : lotId));
    };
    
    const handlePrint = () => {
        const originalTitle = document.title;
        document.title = `BaoCao_TonKho_ChiTiet_${new Date().toLocaleDateString('vi-VN')}`;
        window.print();
        document.title = originalTitle;
    };

    return (
        <div className="printable-inventory-area">
            <div className="page-header">
                <h1>Tồn Kho Chi Tiết</h1>
                {(userRole === 'owner' || userRole === 'admin') && (
                    <button onClick={handlePrint} className="btn-secondary" style={{width: 'auto'}}>
                        <FiPrinter style={{marginRight: '5px'}} />
                        In Báo Cáo
                    </button>
                )}
            </div>
            
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
                                    <th>Team</th>
                                </tr>
                            </thead>
                            <tbody className="inventory-table-body">
                                {inventory.map(lot => (
                                    <tr 
                                        key={lot.id} 
                                        onClick={() => handleRowClick(lot.id)}
                                        className={`${selectedRowId === lot.id ? 'selected-row' : ''} ${getRowColorByExpiry(lot.expiryDate)}`}
                                    >
                                        <td data-label="Ngày nhập">{formatDate(lot.importDate)}</td>
                                        <td data-label="Mã hàng">{lot.productId}</td>
                                        <td data-label="Tên hàng">{lot.productName}</td>
                                        <td data-label="Số lô">{lot.lotNumber}</td>
                                        <td data-label="HSD">{formatDate(lot.expiryDate)}</td>
                                        <td data-label="ĐVT">{lot.unit}</td>
                                        <td data-label="Quy cách">{lot.packaging}</td>
                                        <td data-label="SL Nhập">{formatNumber(lot.quantityImported)}</td>
                                        <td data-label="SL Còn lại">{formatNumber(lot.quantityRemaining)}</td>
                                        <td data-label="Ghi chú">{lot.notes}</td>
                                        <td data-label="Nhiệt độ BQ"><TempBadge temperature={lot.storageTemp} /></td>
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