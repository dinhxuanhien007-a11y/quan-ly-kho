// src/components/QuickStockLookup.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { FiSearch, FiAlertCircle } from 'react-icons/fi';
import Spinner from './Spinner';
import styles from './QuickStockLookup.module.css';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';

const QuickStockLookup = () => {
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

      const lotsByProductIdQuery = query(
        collection(db, 'inventory_lots'),
        where('productId', '==', trimmedTerm)
      );

      const lotsByLotNumberQuery = query(
        collection(db, 'inventory_lots'),
        where('lotNumber', '==', trimmedTerm)
      );

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

        const lotAggregator = new Map();
        for (const lot of uniqueLots) {
            if (lot.quantityRemaining <= 0) continue;

            const lotKey = lot.lotNumber;
            if (lotAggregator.has(lotKey)) {
                const existingLot = lotAggregator.get(lotKey);
                existingLot.quantityRemaining += lot.quantityRemaining;
            } else {
                lotAggregator.set(lotKey, { ...lot });
            }
        }

        const aggregatedLots = Array.from(lotAggregator.values());
        
        const totalRemaining = uniqueLots.reduce((sum, lot) => sum + lot.quantityRemaining, 0);

        if (productInfo) {
          setProductData({
            generalInfo: { ...productInfo, productId: productId },
            // --- BẮT ĐẦU THAY ĐỔI LOGIC SẮP XẾP ---
            lots: aggregatedLots.sort((a, b) => {
                // Xử lý trường hợp không có HSD (đưa xuống cuối)
                const dateA = a.expiryDate ? a.expiryDate.toDate().getTime() : Infinity;
                const dateB = b.expiryDate ? b.expiryDate.toDate().getTime() : Infinity;

                // 1. Ưu tiên sắp xếp theo HSD tăng dần (date gần nhất lên trước)
                if (dateA !== dateB) {
                    return dateA - dateB;
                }

                // 2. Nếu HSD bằng nhau, ưu tiên sắp xếp theo số lượng tồn tăng dần (số lượng ít hơn lên trước)
                return a.quantityRemaining - b.quantityRemaining;
            }),
            // --- KẾT THÚC THAY ĐỔI ---
            totalRemaining: totalRemaining
          });
        } else {
          setProductData(null);
        }
      } else {
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
  }, []);

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
          placeholder="Nhập Mã hàng hoặc Số lô..."
          autoFocus
        />
        <FiSearch />
      </div>
      
      <div className={styles.resultsContainer}>
        {loading ? (
          <Spinner />
        ) : productData ? (
          <>
            <div className={styles.generalInfoGrid}>
              <div className={styles.gridItem}>
                <strong>Mã hàng:</strong>
                <p>{productData.generalInfo.productId}</p>
              </div>
              <div className={styles.gridItem}>
                <strong>Tên hàng:</strong>
                <p>{productData.generalInfo.productName}</p>
              </div>
              <div className={styles.gridItem}>
                <strong>ĐVT:</strong>
                <p>{productData.generalInfo.unit}</p>
              </div>
              <div className={styles.gridItem}>
                <strong>Quy cách:</strong>
                <p>{productData.generalInfo.packaging}</p>
              </div>
              <div className={styles.gridItem}>
                <strong>Nhiệt độ BQ:</strong>
                <p>{productData.generalInfo.storageTemp}</p>
              </div>
              <div className={styles.gridItem}>
                <strong>Hãng SX:</strong>
                <p>{productData.generalInfo.manufacturer}</p>
              </div>
              <div className={styles.gridItem}>
                <strong>Team:</strong>
                <p>{productData.generalInfo.team}</p>
              </div>
              {/* --- THÊM MỚI TẠI ĐÂY --- */}
<div className={styles.gridItem}>
    <strong>Nhóm hàng:</strong>
    <p>{productData.generalInfo.subGroup}</p>
</div>
{/* ------------------------- */}
              <div className={styles.gridItem} style={{gridColumn: '1 / -1'}}>
                <strong>Tổng tồn:</strong>
                <p style={{color: 'green', fontSize: '1.2rem', fontWeight: 'bold'}}>{formatNumber(productData.totalRemaining)} {productData.generalInfo.unit}</p>
              </div>
            </div>

            <div className={styles.lotList}>
              <h4>Tồn kho theo lô:</h4>
              {productData.lots.length > 0 ? (
                productData.lots.map(lot => (
                  <div key={lot.id} className={styles.lotItem}>
                    <div><strong>Số lô:</strong><span>{lot.lotNumber || '(Không có)'}</span></div>
                    <div><strong>HSD:</strong><span>{lot.expiryDate ? formatDate(lot.expiryDate) : '(Không có)'}</span></div>
                    <div><strong>Tồn:</strong><span>{formatNumber(lot.quantityRemaining)} {productData.generalInfo.unit}</span></div>
                    {lot.notes && <div><strong>Ghi chú:</strong><span>{lot.notes}</span></div>}
                  </div>
                ))
              ) : (
                <div className={styles.noResults}>
                  <p>Không có lô hàng nào còn tồn kho.</p>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.noResults}>
            <FiAlertCircle />
            <p>Không tìm thấy kết quả nào.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickStockLookup;
