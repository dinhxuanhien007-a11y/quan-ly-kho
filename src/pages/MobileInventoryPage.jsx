// src/pages/MobileInventoryPage.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../hooks/useAuth';
import Spinner from '../components/Spinner';
import { FiSearch, FiAlertCircle } from 'react-icons/fi';
import styles from '../styles/MobileInventoryPage.module.css';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';

const MobileInventoryPage = () => {
    const { role: userRole } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [productData, setProductData] = useState(null);
    const [loading, setLoading] = useState(false);

    const performSearch = useCallback(async (term) => {
        if (!term) {
            setProductData(null);
            return;
        }
        setLoading(true);
        try {
            const trimmedTerm = term.trim().toUpperCase();

            // Áp dụng bộ lọc team dựa trên vai trò
            let baseQuery = collection(db, 'inventory_lots');
            if (userRole === 'med') {
                baseQuery = query(baseQuery, where('team', '==', 'MED'));
            } else if (userRole === 'bio') {
                baseQuery = query(baseQuery, where('team', 'in', ['BIO', 'Spare Part']));
            }
            
            // Tìm kiếm theo nhiều trường: productId và lotNumber
            const lotsByProductIdQuery = query(baseQuery, where('productId', '==', trimmedTerm));
            const lotsByLotNumberQuery = query(baseQuery, where('lotNumber', '==', trimmedTerm));

            const [byProductIdSnap, byLotNumberSnap] = await Promise.all([
                getDocs(lotsByProductIdQuery),
                getDocs(lotsByLotNumberQuery)
            ]);

            let lots = [
                ...byProductIdSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
                ...byLotNumberSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
            ];

            const uniqueLots = Array.from(new Map(lots.map(item => [item.id, item])).values());
            
            if (uniqueLots.length > 0) {
                const productId = uniqueLots[0].productId;
                const productDocRef = doc(db, 'products', productId);
                const productSnap = await getDoc(productDocRef);
                const productInfo = productSnap.exists() ? productSnap.data() : null;

                if (productInfo) {
                    const totalRemaining = uniqueLots.reduce((sum, lot) => sum + lot.quantityRemaining, 0);

                    setProductData({
                        generalInfo: { ...productInfo, productId: productId },
                        lots: uniqueLots.filter(lot => lot.quantityRemaining > 0).sort((a, b) => (a.expiryDate && b.expiryDate) ? a.expiryDate.toDate() - b.expiryDate.toDate() : 0),
                        totalRemaining: totalRemaining
                    });
                } else {
                    setProductData(null);
                }
            } else {
                // Nếu không tìm thấy lô hàng, thử tìm thẳng sản phẩm theo ID để hiển thị thông tin chung
                const productDocRef = doc(db, 'products', trimmedTerm);
                const productSnap = await getDoc(productDocRef);

                if (productSnap.exists()) {
                    setProductData({
                        generalInfo: { ...productSnap.data(), productId: trimmedTerm },
                        lots: [],
                        totalRemaining: 0
                    });
                } else {
                    setProductData(null);
                }
            }
        } catch (error) {
            console.error("Lỗi tra cứu tồn kho:", error);
            setProductData(null);
        } finally {
            setLoading(false);
        }
    }, [userRole]);

    useEffect(() => {
        const debounce = setTimeout(() => {
            performSearch(searchTerm);
        }, 500);
        return () => clearTimeout(debounce);
    }, [searchTerm, performSearch]);

    return (
        <div className={styles.container}>
            <div className={styles.searchBox}>
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Tìm Mã hàng hoặc Số lô..."
                    autoFocus
                />
                <FiSearch className={styles.searchIcon} />
            </div>

            {loading ? (
                <Spinner />
            ) : productData ? (
                <div className={styles.resultsContainer}>
                    {/* Phần thông tin chung */}
                    <div className={styles.generalInfoCard}>
                        <h3>Thông tin chung</h3>
                        <div className={styles.infoGrid}>
                            <div><strong>Mã hàng:</strong><span>{productData.generalInfo.productId}</span></div>
                            <div><strong>Tên hàng:</strong><span>{productData.generalInfo.productName}</span></div>
                            <div><strong>ĐVT:</strong><span>{productData.generalInfo.unit}</span></div>
                            <div><strong>Quy cách:</strong><span>{productData.generalInfo.packaging}</span></div>
                            <div><strong>Nhiệt độ BQ:</strong><span>{productData.generalInfo.storageTemp}</span></div>
                            <div><strong>Hãng SX:</strong><span>{productData.generalInfo.manufacturer}</span></div>
                            <div><strong>Team:</strong><span>{productData.generalInfo.team}</span></div>
                        </div>
                        <div className={styles.totalInfo}>
                            <strong>Tổng tồn:</strong>
                            <span>{formatNumber(productData.totalRemaining)} {productData.generalInfo.unit}</span>
                        </div>
                    </div>
                    {/* Phần danh sách lô hàng */}
                    <div className={styles.lotListCard}>
                        <h3>Tồn kho theo lô</h3>
                        {productData.lots.length > 0 ? (
                            productData.lots.map(lot => (
                                <div key={lot.id} className={styles.lotItem}>
                                    <div><strong>Số lô:</strong><span>{lot.lotNumber}</span></div>
                                    <div><strong>HSD:</strong><span>{lot.expiryDate ? formatDate(lot.expiryDate) : 'N/A'}</span></div>
                                    <div><strong>Tồn:</strong><span>{formatNumber(lot.quantityRemaining)} {productData.generalInfo.unit}</span></div>
                                    {lot.notes && <div><strong>Ghi chú:</strong><span>{lot.notes}</span></div>}
                                </div>
                            ))
                        ) : (
                            <p className={styles.emptyMessage}>Không có lô hàng nào còn tồn kho.</p>
                        )}
                    </div>
                </div>
            ) : (
                <div classNameer="``{styles.noResults}">
                    <FiAlertCircle />
                    <p>Vui lòng nhập từ khóa để tìm kiếm.</p>
                </div>
            )}
        </div>
    );
};

export default MobileInventoryPage;