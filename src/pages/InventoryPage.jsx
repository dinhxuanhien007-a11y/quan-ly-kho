// src/pages/InventoryPage.jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, getDocs, onSnapshot, where } from 'firebase/firestore';
import InventoryFilters from '../components/InventoryFilters';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { formatDate } from '../utils/dateUtils';

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
    const [masterInventory, setMasterInventory] = useState([]);
    const [searchResults, setSearchResults] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ team: 'all', dateStatus: 'all' });
    const [selectedRowId, setSelectedRowId] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearching, setIsSearching] = useState(false);

    const fetchMasterInventory = useCallback(async () => {
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
        const intervalId = setInterval(() => {
            fetchMasterInventory();
        }, 900000);
        return () => clearInterval(intervalId);
    }, [userRole, fetchMasterInventory]);

    useEffect(() => {
        const trimmedSearch = searchTerm.trim();
        
        if (!trimmedSearch) {
            setIsSearching(false);
            setSearchResults([]);
            return;
        }

        setIsSearching(true);
        setLoading(true);

        const productIdQuery = query(collection(db, "inventory_lots"), where("productId", "==", trimmedSearch));
        const lotNumberQuery = query(collection(db, "inventory_lots"), where("lotNumber", "==", trimmedSearch));

        const unsubProductId = onSnapshot(productIdQuery, (snapshot) => {
            const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSearchResults(prev => [...results, ...prev.filter(p => !results.some(r => r.id === p.id))]);
            setLoading(false);
        });

        const unsubLotNumber = onSnapshot(lotNumberQuery, (snapshot) => {
            const results = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSearchResults(prev => [...results, ...prev.filter(p => !results.some(r => r.id === p.id))]);
            setLoading(false);
        });

        return () => {
            unsubProductId();
            unsubLotNumber();
        };
    }, [searchTerm]);

    const displayedInventory = useMemo(() => {
        let result;
        if (isSearching) {
            result = [...searchResults];
            if (searchTerm.trim() && result.length === 0) {
                 const lowercasedFilter = searchTerm.toLowerCase();
                 result = masterInventory.filter(item => 
                    item.productName?.toLowerCase().includes(lowercasedFilter)
                );
            }
        } else {
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
        
        // --- CẬP NHẬT LOGIC SẮP XẾP ---
        result.sort((a, b) => {
            // Ưu tiên 1: Sắp xếp theo Mã hàng (productId) từ bé đến lớn
            const productCompare = a.productId.localeCompare(b.productId);
            if (productCompare !== 0) {
                return productCompare;
            }
            // Ưu tiên 2: Nếu cùng Mã hàng, sắp xếp theo Ngày nhập (importDate) từ cũ đến mới
            const dateA = a.importDate?.toDate() || 0;
            const dateB = b.importDate?.toDate() || 0;
            return dateA - dateB; // Sắp xếp tăng dần (cũ ở trên, mới ở dưới)
        });
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