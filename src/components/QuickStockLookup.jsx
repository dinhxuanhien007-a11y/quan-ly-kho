// src/components/QuickStockLookup.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, doc, getDoc, documentId, limit } from 'firebase/firestore';
import { FiSearch, FiAlertCircle, FiBox, FiLayers, FiArrowLeft } from 'react-icons/fi';
import Spinner from './Spinner';
import styles from './QuickStockLookup.module.css';
import { formatDate, getRowColorByExpiry } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import HighlightText from './HighlightText'; // <-- IMPORT COMPONENT HIGHLIGHT
import ExpiryBadge from './ExpiryBadge'; // <-- THÊM DÒNG NÀY

// Hàm hỗ trợ tìm kiếm thông minh
const fuzzyNormalize = (str) => {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
};

const QuickStockLookup = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [selectedProductData, setSelectedProductData] = useState(null);
  const [allProductsCache, setAllProductsCache] = useState([]);
  const [loading, setLoading] = useState(false);

  // --- TẢI CACHE KHI MOUNT ---
  useEffect(() => {
        const fetchAllProducts = async () => {
            const q = query(collection(db, 'products'));
            const snapshot = await getDocs(q);
            const cache = snapshot.docs.map(doc => ({
                id: doc.id,
                productName: doc.data().productName || '',
                normName: fuzzyNormalize(doc.data().productName || ''),
                normId: fuzzyNormalize(doc.id)
            }));
            setAllProductsCache(cache);
        };
        fetchAllProducts();
  }, []);

  // --- HÀM TÌM KIẾM ỨNG VIÊN ---
  const performSearch = useCallback(async (term) => {
    if (!term) {
      setCandidates([]);
      setSelectedProductData(null);
      return;
    }
    setLoading(true);
    setSelectedProductData(null);

    try {
      const rawTerm = term.trim().toUpperCase();
      const searchTerms = [rawTerm];
      
      if (!rawTerm.includes('-') && rawTerm.length > 2) {
          searchTerms.push(rawTerm.slice(0, 2) + '-' + rawTerm.slice(2));
      }
      if (rawTerm.includes('-')) {
          searchTerms.push(rawTerm.replace(/-/g, ''));
      }

      const lotsRef = collection(db, 'inventory_lots');
      const queryPromises = [];

      searchTerms.forEach(t => {
          queryPromises.push(getDocs(query(lotsRef, where('productId', '>=', t), where('productId', '<=', t + '\uf8ff'), limit(10))));
          if (t === rawTerm) {
              queryPromises.push(getDocs(query(lotsRef, where('lotNumber', '>=', t), where('lotNumber', '<=', t + '\uf8ff'), limit(10))));
          }
      });

      const snapshots = await Promise.all(queryPromises);
      const resultMap = new Map();

      // 1. TÌM TRONG CACHE
      const searchKey = fuzzyNormalize(term);
      const matchedProducts = allProductsCache.filter(p => 
          p.normName.includes(searchKey) || p.normId.includes(searchKey)
      ).slice(0, 15);

      matchedProducts.forEach(p => {
          const uniqueKey = `PROD_${p.id}`;
          resultMap.set(uniqueKey, {
              key: uniqueKey,
              type: 'product',
              value: p.id,
              subText: p.productName,
              queryId: p.id
          });
      });

      // 2. TÌM TRONG FIRESTORE
      snapshots.forEach(snap => {
          snap.docs.forEach(doc => {
              const data = doc.data();
              const isLotMatch = searchTerms[0] === data.lotNumber;
              const uniqueKey = isLotMatch 
                  ? `LOT_${data.lotNumber}_${data.productId}` 
                  : `PROD_${data.productId}`;

              if (isLotMatch) {
                  resultMap.set(uniqueKey, {
                      key: uniqueKey,
                      type: 'lot',
                      value: data.lotNumber,
                      subText: `Mã: ${data.productId}`,
                      queryId: data.productId 
                  });
              } else if (!resultMap.has(uniqueKey)) {
                  resultMap.set(uniqueKey, {
                      key: uniqueKey,
                      type: 'product',
                      value: data.productId,
                      subText: data.productName,
                      queryId: data.productId
                  });
              }
          });
      });

      setCandidates(Array.from(resultMap.values()));

    } catch (error) {
      console.error("Lỗi tra cứu:", error);
    } finally {
      setLoading(false);
    }
  }, [allProductsCache]);

  // --- HÀM XEM CHI TIẾT ---
  const handleSelectCandidate = async (candidate) => {
      setLoading(true);
      try {
          const productId = candidate.queryId;
          const productDocRef = doc(db, 'products', productId);
          const productSnap = await getDoc(productDocRef);
          const productInfo = productSnap.exists() ? productSnap.data() : null;

          if (!productInfo) {
              setLoading(false);
              return;
          }

          const lotsQuery = query(collection(db, 'inventory_lots'), where('productId', '==', productId), where('quantityRemaining', '>', 0));
          const lotsSnap = await getDocs(lotsQuery);
          const lots = lotsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

          const lotAggregator = new Map();
          for (const lot of lots) {
              if (lot.productId !== productId) continue;

              const lotKey = lot.lotNumber || '(Không có)';
              if (lotAggregator.has(lotKey)) {
                  const existingLot = lotAggregator.get(lotKey);
                  existingLot.quantityRemaining += lot.quantityRemaining;
                  if (lot.expiryDate && (!existingLot.expiryDate || lot.expiryDate.toDate() < existingLot.expiryDate.toDate())) {
                      existingLot.expiryDate = lot.expiryDate;
                  }
              } else {
                  lotAggregator.set(lotKey, { ...lot });
              }
          }
          const aggregatedLots = Array.from(lotAggregator.values());
          const totalRemaining = aggregatedLots.reduce((sum, lot) => sum + lot.quantityRemaining, 0);

          setSelectedProductData({
              generalInfo: { ...productInfo, productId: productId },
              lots: aggregatedLots.sort((a, b) => {
                  const dateA = a.expiryDate ? a.expiryDate.toDate().getTime() : Infinity;
                  const dateB = b.expiryDate ? b.expiryDate.toDate().getTime() : Infinity;
                  if (dateA !== dateB) return dateA - dateB;
                  return a.quantityRemaining - b.quantityRemaining;
              }),
              totalRemaining: totalRemaining
          });
      } catch (error) {
          console.error("Lỗi tải chi tiết:", error);
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {
    const debounce = setTimeout(() => {
      if (searchTerm) performSearch(searchTerm);
      else { setCandidates([]); setSelectedProductData(null); }
    }, 500); 
    return () => clearTimeout(debounce);
  }, [searchTerm, performSearch]);

  const handleBack = () => {
      setSelectedProductData(null);
  };

  return (
    <div className={styles.container}>
      <div className={styles.searchBox}>
        <input 
          type="text" 
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Tên, Mã hàng hoặc Số lô..."
          autoFocus
        />
        <FiSearch />
      </div>
      
      <div className={styles.resultsContainer}>
        {loading ? (
          <Spinner />
        ) : (
            <>
                {/* 1. LIST GỢI Ý */}
                {!selectedProductData && candidates.length > 0 && (
                    <div className={styles.candidatesList}>
                        {candidates.map(item => (
                            <div 
                                key={item.key} 
                                className={styles.candidateItem}
                                onClick={() => handleSelectCandidate(item)}
                            >
                                <div className={styles.iconWrapper} style={{backgroundColor: item.type === 'product' ? '#e7f3ff' : '#e6fffa'}}>
                                    {item.type === 'product' ? <FiBox color="#007bff"/> : <FiLayers color="#28a745"/>}
                                </div>
                                <div className={styles.textWrapper}>
                                    {/* --- HIGHLIGHT CHO DANH SÁCH GỢI Ý --- */}
                                    <strong><HighlightText text={item.value} highlight={searchTerm} /></strong>
                                    <span><HighlightText text={item.subText} highlight={searchTerm} /></span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* 2. CHI TIẾT SẢN PHẨM */}
                {selectedProductData && (
                    <div>
                        <button onClick={handleBack} className="btn-link" style={{marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '5px', padding: 0, cursor: 'pointer', background: 'none', border: 'none', color: '#007bff'}}>
                            <FiArrowLeft /> Quay lại kết quả
                        </button>
                        
                        <div className={styles.generalInfoGrid}>
                            {/* --- HIGHLIGHT CHO THÔNG TIN CHUNG --- */}
                            <div className={styles.gridItem}><strong>Mã hàng:</strong><p><HighlightText text={selectedProductData.generalInfo.productId} highlight={searchTerm} /></p></div>
                            <div className={styles.gridItem}><strong>Tên hàng:</strong><p><HighlightText text={selectedProductData.generalInfo.productName} highlight={searchTerm} /></p></div>
                            <div className={styles.gridItem}><strong>ĐVT:</strong><p>{selectedProductData.generalInfo.unit}</p></div>
                            <div className={styles.gridItem}><strong>Quy cách:</strong><p>{selectedProductData.generalInfo.packaging}</p></div>
                            <div className={styles.gridItem}><strong>Nhiệt độ BQ:</strong><p>{selectedProductData.generalInfo.storageTemp}</p></div>
                            <div className={styles.gridItem}><strong>Hãng SX:</strong><p>{selectedProductData.generalInfo.manufacturer}</p></div>
                            <div className={styles.gridItem}><strong>Team:</strong><p>{selectedProductData.generalInfo.team}</p></div>
                            <div className={styles.gridItem}><strong>Nhóm hàng:</strong><p>{selectedProductData.generalInfo.subGroup}</p></div>
                            
                            <div className={styles.gridItem} style={{gridColumn: '1 / -1', borderTop: '1px dashed #eee', paddingTop: '10px', marginTop: '5px'}}>
                                <strong>Tổng tồn:</strong>
                                <p style={{color: 'green', fontSize: '1.2rem', fontWeight: 'bold'}}>
                                    {formatNumber(selectedProductData.totalRemaining)} {selectedProductData.generalInfo.unit}
                                </p>
                            </div>
                        </div>

                        <div className={styles.lotList}>
                            <h4>Tồn kho theo lô:</h4>
                            {selectedProductData.lots.length > 0 ? (
                                selectedProductData.lots.map(lot => {
                                    const colorClass = getRowColorByExpiry(lot.expiryDate, selectedProductData.generalInfo.subGroup);
                                return (
                                    <div key={lot.id} className={`${styles.lotItem} ${styles[colorClass] || ''}`}>
                                    {/* --- HIGHLIGHT CHO SỐ LÔ --- */}
                                    <div><strong>Số lô:</strong><span><HighlightText text={lot.lotNumber || '(Không có)'} highlight={searchTerm} /></span></div>
                                    <div style={{ alignItems: 'flex-start', marginTop: '4px' }}>
                <strong style={{ marginTop: '2px' }}>HSD:</strong>
                <div style={{ width: '180px' }}> {/* Cố định chiều rộng để thẳng hàng */}
                    <ExpiryBadge 
                        expiryDate={lot.expiryDate} 
                        subGroup={selectedProductData.generalInfo.subGroup} 
                        compact={true}       /* Hiển thị dạng gọn (1 dòng) */
                        showProgressBar={false} /* Tắt thanh tiến trình cho đỡ rối mắt */
                    />
                </div>
            </div>
                                    <div><strong>Tồn:</strong><span>{formatNumber(lot.quantityRemaining)}</span></div>
                                    {lot.notes && <div><strong>Ghi chú:</strong><span>{lot.notes}</span></div>}
                                    </div>
                                );
                                })
                            ) : (
                                <div className={styles.noResults}><p>Hết hàng.</p></div>
                            )}
                        </div>
                    </div>
                )}

                {/* 3. KHÔNG CÓ KẾT QUẢ */}
                {!selectedProductData && candidates.length === 0 && searchTerm && (
                    <div className={styles.noResults}>
                        <FiAlertCircle />
                        <p>Không tìm thấy kết quả nào.</p>
                    </div>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default QuickStockLookup;