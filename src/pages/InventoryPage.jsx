// src/pages/InventoryPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, getDocs, onSnapshot, where } from 'firebase/firestore';
import InventoryFilters from '../components/InventoryFilters';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { formatDate } from '../utils/dateUtils';

// Hàm tô màu HSD không thay đổi
const getRowColorByExpiry = (expiryDate) => {
    if (!expiryDate || !expiryDate.toDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = expiryDate.toDate();
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'expired-black';
    if (diffDays <= 60) return 'near-expiry-red';
    if (diffDays <= 90) return 'near-expiry-orange';
    if (diffDays <= 120) return 'near-expiry-yellow';
    return '';
};

const InventoryPage = ({ user, userRole }) => {
    // State cho dữ liệu nền, làm mới định kỳ
    const [masterInventory, setMasterInventory] = useState([]);
    // State cho kết quả tìm kiếm real-time
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ team: 'all', dateStatus: 'all' });
    const [selectedRowId, setSelectedRowId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    // State để xác định đang ở chế độ tìm kiếm hay không
    const [isSearching, setIsSearching] = useState(false);

    // Hàm fetch dữ liệu thủ công cho toàn bộ kho
    const fetchMasterInventory = useCallback(async () => {
        // Chỉ setLoading nếu chưa có dữ liệu gì
        if (masterInventory.length === 0) {
            setLoading(true);
        }
        try {
            const q = query(collection(db, "inventory_lots"));
            const querySnapshot = await getDocs(q);
            const allInventory = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            let roleBasedInventory = [];
            if (userRole === 'med') {
                roleBasedInventory = allInventory.filter(item => item.team === 'MED');
            } else if (userRole === 'bio') {
                roleBasedInventory = allInventory.filter(item => item.team === 'BIO' || item.team === 'Spare Part');
            } else {
                roleBasedInventory = allInventory;
            }
            setMasterInventory(roleBasedInventory);
        } catch (error) {
            console.error("Lỗi khi lấy dữ liệu tồn kho: ", error);
        } finally {
            setLoading(false);
        }
    }, [userRole, masterInventory.length]);

    // useEffect 1: Tải dữ liệu ban đầu và làm mới định kỳ
    useEffect(() => {
        if (userRole) {
            fetchMasterInventory();
        }
        const intervalId = setInterval(() => {
            console.log("Tự động làm mới dữ liệu nền...");
            fetchMasterInventory();
        }, 900000); // 15 phút

        return () => clearInterval(intervalId);
    }, [userRole, fetchMasterInventory]);

    // useEffect 2: Xử lý tìm kiếm REAL-TIME
    useEffect(() => {
        const trimmedSearch = searchTerm.trim();
        
        // Nếu không có từ khóa, tắt chế độ tìm kiếm và hủy listener
        if (!trimmedSearch) {
            setIsSearching(false);
            setSearchResults([]);
            return;
        }

        // Bật chế độ tìm kiếm
        setIsSearching(true);
        setLoading(true);

        // Tạo các truy vấn real-time. Firestore yêu cầu các truy vấn riêng biệt cho các trường khác nhau.
        // Chúng ta sẽ ưu tiên Mã hàng và Số lô.
        const productIdQuery = query(collection(db, "inventory_lots"), where("productId", "==", trimmedSearch));
        const lotNumberQuery = query(collection(db, "inventory_lots"), where("lotNumber", "==", trimmedSearch));

        // Lắng nghe cả hai truy vấn
        const unsubProductId = onSnapshot(productIdQuery, (snapshot) => {
            const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Cập nhật kết quả, tránh trùng lặp
            setSearchResults(prev => [...results, ...prev.filter(p => !results.some(r => r.id === p.id))]);
            setLoading(false);
        });

        const unsubLotNumber = onSnapshot(lotNumberQuery, (snapshot) => {
            const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSearchResults(prev => [...results, ...prev.filter(p => !results.some(r => r.id === p.id))]);
            setLoading(false);
        });

        // Hàm dọn dẹp: Hủy cả hai listener khi component unmount hoặc searchTerm thay đổi
        return () => {
            unsubProductId();
            unsubLotNumber();
        };
    }, [searchTerm]);

    // useMemo để quyết định danh sách nào sẽ được hiển thị
    const displayedInventory = useMemo(() => {
        let result;
        // Nếu đang tìm kiếm, ưu tiên hiển thị kết quả real-time
        if (isSearching) {
            result = [...searchResults];
            // Nếu không có kết quả real-time, thử tìm kiếm trên Tên hàng từ dữ liệu nền
            if (searchTerm.trim() && result.length === 0) {
                 const lowercasedFilter = searchTerm.toLowerCase();
                 result = masterInventory.filter(item => 
                    item.productName?.toLowerCase().includes(lowercasedFilter)
                );
            }
        } else {
            // Nếu không tìm kiếm, hiển thị dữ liệu nền đã được lọc
            result = [...masterInventory];

            if (filters.team !== 'all') {
                result = result.filter(item => item.team === filters.team);
            }
            if (filters.dateStatus !== 'all') {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (filters.dateStatus === 'expired') {
                    result = result.filter(item => item.expiryDate?.toDate() < today);
                }
                if (filters.dateStatus === 'near_expiry') {
                    const nearExpiryLimit = new Date();
                    nearExpiryLimit.setDate(today.getDate() + 120);
                    result = result.filter(item => {
                        const expiryDate = item.expiryDate?.toDate();
                        return expiryDate >= today && expiryDate < nearExpiryLimit;
                    });
                }
            }
        }
        
        // Luôn sắp xếp kết quả cuối cùng
        result.sort((a, b) => (b.importDate?.toDate() || 0) - (a.importDate?.toDate() || 0));
        return result;
    }, [isSearching, searchResults, masterInventory, filters, searchTerm]);


    const handleFilterChange = (filterName, value) => {
        setFilters(prev => ({ ...prev, [filterName]: value }));
    };

    const handleRowClick = (lotId) => {
        setSelectedRowId(prevId => (prevId === lotId ? null : lotId));
    };
    
    const getTitleByRole = (role) => {
        switch (role) {
            case 'med': return 'Sổ Cái Tồn Kho (Team Med)';
            case 'bio': return 'Sổ Cái Tồn Kho (Team Bio)';
            case 'admin': return 'Sổ Cái Tồn Kho (Admin)';
            case 'owner': return 'Sổ Cái Tồn Kho (Owner)';
            default: return 'Sổ Cái Tồn Kho';
        }
    };
    
    return (
        <div>
            <div className="page-header">
                <h1>{getTitleByRole(userRole)}</h1>
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
                        placeholder="Tìm Mã hàng, Tên hàng, Số lô..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="search-input"
                    />
                </div>
            </div>

            <div className="table-container">
                 {loading && displayedInventory.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '20px' }}>Đang tải dữ liệu...</div>
                ) : (
                    <table className="inventory-table">
                        <thead>
                            <tr>
                                <th>Ngày nhập hàng</th>
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
                                <th>Hãng SX</th>
                                <th>Team</th>
                            </tr>
                        </thead>
                        <tbody className="inventory-table-body">
                            {displayedInventory.length > 0 ? (
                                displayedInventory.map(lot => (
                                    <tr
                                        key={lot.id}
                                        onClick={() => handleRowClick(lot.id)}
                                        className={`${selectedRowId === lot.id ? 'selected-row' : ''} ${getRowColorByExpiry(lot.expiryDate)}`}
                                    >
                                        <td>{formatDate(lot.importDate)}</td>
                                        <td>{lot.productId}</td>
                                        <td>{lot.productName}</td>
                                        <td>{lot.lotNumber}</td>
                                        <td>{formatDate(lot.expiryDate)}</td>
                                        <td>{lot.unit}</td>
                                        <td>{lot.packaging}</td>
                                        <td>{lot.quantityImported}</td>
                                        <td>{lot.quantityRemaining}</td>
                                        <td>{lot.notes}</td>
                                        <td><TempBadge temperature={lot.storageTemp} /></td>
                                        <td>{lot.manufacturer}</td>
                                        <td><TeamBadge team={lot.team} /></td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="13" style={{ textAlign: 'center' }}>
                                        {isSearching ? "Không tìm thấy kết quả real-time nào." : "Không có dữ liệu tồn kho phù hợp."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
        </div>
    );
};

export default InventoryPage;

