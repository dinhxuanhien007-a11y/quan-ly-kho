// src/pages/InventorySummaryPage.jsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, getDocs, where, onSnapshot } from 'firebase/firestore';
import { formatDate } from '../utils/dateUtils';
import TeamBadge from '../components/TeamBadge';
import TempBadge from '../components/TempBadge';
import { FiChevronDown, FiChevronRight } from 'react-icons/fi';

// Các hàm tô màu getSummaryRowColor và getLotItemColorClass giữ nguyên
const getSummaryRowColor = (lots) => {
    if (!lots || lots.length === 0) return '';
    let nearestExpiryDays = Infinity;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (const lot of lots) {
        if (lot.expiryDate && lot.expiryDate.toDate) {
            const expDate = lot.expiryDate.toDate();
            expDate.setHours(0, 0, 0, 0);
            const diffTime = expDate.getTime() - today.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            if (diffDays < nearestExpiryDays) {
                nearestExpiryDays = diffDays;
            }
        }
    }
    if (nearestExpiryDays === Infinity) return '';
    if (nearestExpiryDays < 0) return 'expired-black';
    if (nearestExpiryDays <= 60) return 'near-expiry-red';
    if (nearestExpiryDays <= 90) return 'near-expiry-orange';
    if (nearestExpiryDays <= 120) return 'near-expiry-yellow';
    return '';
};
const getLotItemColorClass = (expiryDate) => {
    if (!expiryDate || !expiryDate.toDate) return '';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expDate = expiryDate.toDate();
    expDate.setHours(0, 0, 0, 0);
    const diffTime = expDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'lot-item-expired';
    if (diffDays <= 60) return 'lot-item-red';
    if (diffDays <= 90) return 'lot-item-orange';
    if (diffDays <= 120) return 'lot-item-yellow';
    return '';
};

const InventorySummaryPage = ({ user, userRole }) => {
    const [productsMap, setProductsMap] = useState({});
    const [masterInventory, setMasterInventory] = useState([]);
    const [realtimeLots, setRealtimeLots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [expandedRows, setExpandedRows] = useState({});
    const [isRealtimeActive, setIsRealtimeActive] = useState(false);

    const fetchAllData = useCallback(async () => {
        if (masterInventory.length === 0) setLoading(true);
        try {
            const productsSnapshot = await getDocs(collection(db, "products"));
            const productsData = {};
            productsSnapshot.forEach(doc => { productsData[doc.id] = doc.data(); });
            setProductsMap(productsData);

            // --- SỬA LỖI LOGIC TRUY VẤN TẠI ĐÂY ---
            let lotsQuery;
            const lotsCollection = collection(db, "inventory_lots");

            if (userRole === 'med') {
                lotsQuery = query(lotsCollection, where("team", "==", "MED"));
            } else if (userRole === 'bio') {
                lotsQuery = query(lotsCollection, where("team", "in", ["BIO", "Spare Part"]));
            } else { // admin, owner
                lotsQuery = query(lotsCollection);
            }
            
            const lotsSnapshot = await getDocs(lotsQuery);
            const visibleInventory = lotsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMasterInventory(visibleInventory);

        } catch (error) {
            console.error("Lỗi khi lấy dữ liệu: ", error);
        } finally {
            setLoading(false);
        }
    }, [userRole, masterInventory.length]);

    useEffect(() => {
        if (userRole) {
            fetchAllData();
        }
        const intervalId = setInterval(() => {
            fetchAllData();
        }, 900000);

        return () => clearInterval(intervalId);
    }, [userRole, fetchAllData]);

    useEffect(() => {
        const trimmedSearch = searchTerm.trim().toUpperCase();
        if (trimmedSearch.length > 3) {
            setIsRealtimeActive(true);
            const q = query(collection(db, "inventory_lots"), where("productId", "==", trimmedSearch));
            
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const lots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setRealtimeLots(lots);
            });
            return () => unsubscribe();
        } else {
            setIsRealtimeActive(false);
            setRealtimeLots([]);
        }
    }, [searchTerm]);

    const summarizedAndFilteredInventory = useMemo(() => {
        let summary = masterInventory.reduce((acc, lot) => {
            if (lot.quantityRemaining > 0) {
                if (!acc[lot.productId]) {
                    const productInfo = productsMap[lot.productId] || {};
                    acc[lot.productId] = {
                        productId: lot.productId, productName: productInfo.productName || lot.productName,
                        unit: productInfo.unit, packaging: productInfo.packaging,
                        storageTemp: productInfo.storageTemp, manufacturer: productInfo.manufacturer,
                        team: productInfo.team || lot.team,
                        totalRemaining: 0, lots: []
                    };
                }
                acc[lot.productId].totalRemaining += lot.quantityRemaining;
                acc[lot.productId].lots.push({
                    lotId: lot.id, lotNumber: lot.lotNumber,
                    expiryDate: lot.expiryDate, quantityRemaining: lot.quantityRemaining
                });
            }
            return acc;
        }, {});

        if (isRealtimeActive) {
            const productId = searchTerm.trim().toUpperCase();
            const productInfo = productsMap[productId] || {};
            if (realtimeLots.length > 0) {
                summary[productId] = {
                    productId: productId, productName: productInfo.productName || realtimeLots[0].productName,
                    unit: productInfo.unit, packaging: productInfo.packaging,
                    storageTemp: productInfo.storageTemp, manufacturer: productInfo.manufacturer,
                    team: productInfo.team || realtimeLots[0].team,
                    totalRemaining: realtimeLots.reduce((sum, lot) => sum + lot.quantityRemaining, 0),
                    lots: realtimeLots.map(lot => ({
                        lotId: lot.id, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate,
                        quantityRemaining: lot.quantityRemaining
                    }))
                };
            } else {
                 if(summary[productId]){
                    summary[productId].totalRemaining = 0;
                    summary[productId].lots = [];
                 }
            }
        }

        const summaryArray = Object.values(summary);
        summaryArray.forEach(product => {
            product.rowColorClass = getSummaryRowColor(product.lots);
            product.lots.sort((a, b) => a.expiryDate.toDate() - b.expiryDate.toDate());
        });

        if (searchTerm && !isRealtimeActive) {
            const lowercasedFilter = searchTerm.toLowerCase();
            return summaryArray.filter(item => 
                item.productId.toLowerCase().includes(lowercasedFilter) ||
                (item.productName && item.productName.toLowerCase().includes(lowercasedFilter))
            );
        }

        return summaryArray.sort((a, b) => a.productId.localeCompare(b.productId));
    }, [masterInventory, productsMap, searchTerm, isRealtimeActive, realtimeLots]);
    
    const toggleRow = (productId) => {
        setExpandedRows(prev => ({ ...prev, [productId]: !prev[productId] }));
    };
    
    if (loading) return <div>Đang tải dữ liệu tồn kho...</div>;

    return (
        <div>
            <div className="search-container" style={{maxWidth: '500px', marginBottom: '20px'}}>
                <input
                    type="text"
                    placeholder="Tìm theo Mã hoặc Tên hàng..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                />
            </div>

            <div className="table-container" style={{maxHeight: 'calc(100vh - 180px)'}}>
                <table className="products-table">
                    <thead>
                        <tr>
                            <th style={{width: '50px'}}></th>
                            <th>Mã hàng</th>
                            <th>Tên hàng</th>
                            <th>Tổng Tồn</th>
                            <th>ĐVT</th>
                            <th>Quy cách</th>
                            <th>Nhiệt độ BQ</th>
                            <th>Hãng SX</th>
                            <th>Team</th>
                        </tr>
                    </thead>
                    <tbody>
                        {summarizedAndFilteredInventory.length > 0 ? (
                            summarizedAndFilteredInventory.map(product => (
                                <React.Fragment key={product.productId}>
                                    <tr 
                                        onClick={() => toggleRow(product.productId)} 
                                        className={product.rowColorClass}
                                        style={{cursor: 'pointer'}}
                                    >
                                        <td>{expandedRows[product.productId] ? <FiChevronDown /> : <FiChevronRight />}</td>
                                        <td><strong>{product.productId}</strong></td>
                                        <td style={{textAlign: 'left', whiteSpace: 'normal'}}>{product.productName}</td>
                                        <td><strong>{product.totalRemaining}</strong></td>
                                        <td>{product.unit}</td>
                                        <td style={{whiteSpace: 'normal'}}>{product.packaging}</td>
                                        <td><TempBadge temperature={product.storageTemp} /></td>
                                        <td>{product.manufacturer}</td>
                                        <td><TeamBadge team={product.team} /></td>
                                    </tr>
                                    {expandedRows[product.productId] && (
                                        <tr className="lot-details-row">
                                            <td colSpan="9">
                                                <div className="lot-details-container">
                                                    <h4>Chi tiết các lô hàng (FEFO):</h4>
                                                    <ul>
                                                        {product.lots.map(lot => (
                                                            <li key={lot.lotId} className={`lot-item ${getLotItemColorClass(lot.expiryDate)}`}>
                                                                <span>Lô: <strong>{lot.lotNumber}</strong></span>
                                                                <span>HSD: <strong>{formatDate(lot.expiryDate)}</strong></span>
                                                                <span>Tồn: <strong>{lot.quantityRemaining}</strong></span>
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
                        ) : (
                            <tr><td colSpan="9" style={{textAlign: 'center'}}>Không có hàng hóa tồn kho.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default InventorySummaryPage;