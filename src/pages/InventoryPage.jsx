// src/pages/InventoryPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, getDocs, where, orderBy, limit, startAfter, Timestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';
import InventoryFilters from '../components/InventoryFilters';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { formatDate } from '../utils/dateUtils';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const PAGE_SIZE = 20;

const getRowColorByExpiry = (expiryDate) => {
    if (!expiryDate || !expiryDate.toDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = expiryDate.toDate();
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'expired-black';
    if (diffDays <= 60) return 'near-expiry-red';
    if (diffDays <= 90) return 'near-expiry-orange';
    if (diffDays <= 120) return 'near-expiry-yellow';
    return '';
};

const InventoryPage = () => {
    const { userRole } = useAuth();

    const [inventory, setInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ team: 'all', dateStatus: 'all' });
    const [searchTerm, setSearchTerm] = useState('');
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    const [isLastPage, setIsLastPage] = useState(false);
    
    // THÊM LẠI STATE ĐỂ THEO DÕI DÒNG ĐƯỢC CHỌN
    const [selectedRowId, setSelectedRowId] = useState(null);

    const buildQuery = () => {
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
            const today = Timestamp.now();
            q = query(q, where("expiryDate", "<", today));
        } else if (filters.dateStatus === 'near_expiry') {
            const today = Timestamp.now();
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 120);
            const futureTimestamp = Timestamp.fromDate(futureDate);
            q = query(q, where("expiryDate", ">=", today), where("expiryDate", "<=", futureTimestamp));
        }
        
        if (searchTerm) {
            const upperSearchTerm = searchTerm.toUpperCase();
            q = query(q, where("productId", ">=", upperSearchTerm), where("productId", "<=", upperSearchTerm + '\uf8ff'));
        }
        return q;
    };

    const fetchFirstPage = useCallback(async () => {
        setLoading(true);
        try {
            const q = buildQuery();
            const firstPageQuery = query(q, limit(PAGE_SIZE));
            const docSnapshots = await getDocs(firstPageQuery);
            
            const inventoryList = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInventory(inventoryList);

            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setPage(1);
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu tồn kho: ", error);
            toast.error("Không thể tải dữ liệu. Vui lòng kiểm tra Console (F12) để tạo Index nếu được yêu cầu.");
        } finally {
            setLoading(false);
        }
    }, [userRole, filters, searchTerm]);

    const fetchNextPage = useCallback(async () => {
        if (!lastVisible) return;
        setLoading(true);
        try {
            const q = buildQuery();
            const nextPageQuery = query(q, startAfter(lastVisible), limit(PAGE_SIZE));
            const docSnapshots = await getDocs(nextPageQuery);

            const inventoryList = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setInventory(inventoryList);

            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setPage(p => p + 1);
        } catch (error) {
            console.error("Lỗi khi tải dữ liệu tồn kho: ", error);
        } finally {
            setLoading(false);
        }
    }, [lastVisible, userRole, filters, searchTerm]);

    useEffect(() => {
        const debounce = setTimeout(() => {
            fetchFirstPage();
        }, 500);
        return () => clearTimeout(debounce);
    }, [fetchFirstPage]);
    
    const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
    };

    // THÊM LẠI HÀM XỬ LÝ KHI NHẤN VÀO DÒNG
    const handleRowClick = (lotId) => {
        setSelectedRowId(prevId => (prevId === lotId ? null : lotId));
    };
    
    return (
        <div>
            <div className="page-header">
                <h1>Tồn Kho Chi Tiết</h1>
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
                                    // CẬP NHẬT LẠI DÒNG NÀY
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
                                        <td data-label="SL Nhập">{lot.quantityImported}</td>
                                        <td data-label="SL Còn lại">{lot.quantityRemaining}</td>
                                        <td data-label="Ghi chú">{lot.notes}</td>
                                        <td data-label="Nhiệt độ BQ"><TempBadge temperature={lot.storageTemp} /></td>
                                        <td data-label="Team"><TeamBadge team={lot.team} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    
                    {!searchTerm && (
                        <div className="pagination-controls">
                            <button onClick={() => { setLastVisible(null); fetchFirstPage(); }} disabled={page <= 1}>
                                <FiChevronLeft /> Trang Trước
                            </button>
                            <span>Trang {page}</span>
                            <button onClick={fetchNextPage} disabled={isLastPage}>
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