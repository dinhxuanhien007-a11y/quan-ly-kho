// src/pages/InventoryPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, getDocs, where } from 'firebase/firestore';
import InventoryFilters from '../components/InventoryFilters';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { formatDate } from '../utils/dateUtils';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner'; // <-- ĐÃ THÊM

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

const InventoryPage = () => {
    const { userRole } = useAuth();

    const [masterInventory, setMasterInventory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ team: 'all', dateStatus: 'all' });
    const [selectedRowId, setSelectedRowId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchMasterInventory = useCallback(async () => {
        // Chỉ hiện loading spinner cho lần tải đầu tiên
        if (masterInventory.length === 0) setLoading(true);
        try {
            let q;
            const lotsCollection = collection(db, "inventory_lots");
        
            if (userRole === 'med') {
                q = query(lotsCollection, where("team", "==", "MED"));
            } else if (userRole === 'bio') {
                q = query(lotsCollection, where("team", "in", ["BIO", "Spare Part"]));
            } else {
                q = query(lotsCollection);
            }

            const querySnapshot = await getDocs(q);
            const inventoryList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMasterInventory(inventoryList);
        } catch (error) {
            console.error("Lỗi khi lấy dữ liệu tồn kho: ", error);
        } finally {
            setLoading(false);
        }
    }, [userRole, masterInventory.length]);

    useEffect(() => {
        if (userRole) {
            fetchMasterInventory();
        }
        // Tự động tải lại dữ liệu sau mỗi 15 phút
        const intervalId = setInterval(() => {
            fetchMasterInventory();
        }, 900000);
        return () => clearInterval(intervalId);
    }, [userRole, fetchMasterInventory]);

    const displayedInventory = useMemo(() => {
        let filteredResult = [...masterInventory];

        if (filters.team !== 'all') {
            filteredResult = filteredResult.filter(item => item.team === filters.team);
        }
        if (filters.dateStatus !== 'all') {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (filters.dateStatus === 'expired') {
                filteredResult = filteredResult.filter(item => item.expiryDate?.toDate() < today);
            }
            if (filters.dateStatus === 'near_expiry') {
                const nearExpiryLimit = new Date();
                nearExpiryLimit.setDate(today.getDate() + 120);
                filteredResult = filteredResult.filter(item => {
                    const expiryDate = item.expiryDate?.toDate();
                    return expiryDate >= today && expiryDate < nearExpiryLimit;
                });
            }
        }
        
        if (searchTerm) {
            const lowercasedFilter = searchTerm.toLowerCase();
            filteredResult = filteredResult.filter(item =>
                item.productId?.toLowerCase().includes(lowercasedFilter) ||
                item.productName?.toLowerCase().includes(lowercasedFilter) ||
                item.lotNumber?.toLowerCase().includes(lowercasedFilter)
            );
        }

        filteredResult.sort((a, b) => {
            const productCompare = a.productId.localeCompare(b.productId);
            if (productCompare !== 0) {
                return productCompare;
            }
            const dateA = a.importDate?.toDate() || 0;
            const dateB = b.importDate?.toDate() || 0;
            return dateA - dateB;
        });
        return filteredResult;
    }, [masterInventory, filters, searchTerm]); 


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
                 {loading ? ( // <-- ĐÃ SỬA
                    <Spinner />
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
                                        <td data-label="Hãng SX">{lot.manufacturer}</td>
                                        <td data-label="Team"><TeamBadge team={lot.team} /></td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan="13" style={{ textAlign: 'center' }}>
                                        Không có dữ liệu tồn kho phù hợp với bộ lọc hoặc từ khóa tìm kiếm.
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