// src/pages/MobileInventoryPage.jsx

import { useState, useEffect, useCallback, useRef } from 'react';
import { db, app } from '../firebaseConfig'; 
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, doc, getDoc, limit } from 'firebase/firestore';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';
import { FiSearch, FiAlertCircle, FiMic, FiBox, FiLayers, FiArrowLeft, FiRefreshCw } from 'react-icons/fi';
import styles from '../styles/MobileInventoryPage.module.css';
import { getRowColorByExpiry } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import companyLogo from '../assets/logo.png';
import { toast } from 'react-toastify';
import HighlightText from '../components/HighlightText';
import ExpiryBadge from '../components/ExpiryBadge';

const functionsAsia = getFunctions(app, 'asia-southeast1');

// Chuyển đổi chuỗi: Xóa dấu, xóa khoảng trắng, về chữ thường
const fuzzyNormalize = (str) => {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
};

const MobileInventoryPage = () => {
    const { role: userRole } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    
    const [candidates, setCandidates] = useState([]); 
    const [selectedProductData, setSelectedProductData] = useState(null); 
    const [allProductsCache, setAllProductsCache] = useState([]);
    const [isCacheReady, setIsCacheReady] = useState(false);
    
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);

    // Pull-to-refresh state
    const touchStartY = useRef(0);
    const containerRef = useRef(null);
    
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    // --- TẢI CACHE SẢN PHẨM ---
    const fetchAllProducts = useCallback(async (showToast = false) => {
        try {
            const q = query(collection(db, 'products'));
            const snapshot = await getDocs(q);
            
            const cache = snapshot.docs.map(d => {
                const data = d.data();
                return {
                    id: d.id,
                    productName: data.productName || '',
                    team: data.team,
                    normName: fuzzyNormalize(data.productName),
                    normId: fuzzyNormalize(d.id)
                };
            });
            setAllProductsCache(cache);
            setIsCacheReady(true);
            if (showToast) toast.success("Đã cập nhật danh sách sản phẩm.");
        } catch (error) {
            console.error("Lỗi tải cache sản phẩm:", error);
            toast.error("Không thể tải danh sách sản phẩm.");
        }
    }, []);

    useEffect(() => {
        fetchAllProducts();
    }, [fetchAllProducts]);

    // --- PULL-TO-REFRESH ---
    const handleTouchStart = (e) => {
        touchStartY.current = e.touches[0].clientY;
    };

    const handleTouchEnd = async (e) => {
        const deltaY = e.changedTouches[0].clientY - touchStartY.current;
        const scrollTop = containerRef.current?.scrollTop ?? 0;
        // Chỉ trigger khi kéo xuống > 80px và đang ở đầu trang
        if (deltaY > 80 && scrollTop === 0 && !isRefreshing) {
            setIsRefreshing(true);
            await fetchAllProducts(true);
            setIsRefreshing(false);
        }
    };

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

            let baseQuery = collection(db, 'inventory_lots');
            if (userRole === 'med') baseQuery = query(baseQuery, where('team', '==', 'MED'));
            else if (userRole === 'bio') baseQuery = query(baseQuery, where('team', 'in', ['BIO', 'Spare Part']));

            const queryPromises = [];
            searchTerms.forEach(t => {
                queryPromises.push(getDocs(query(baseQuery, where('productId', '>=', t), where('productId', '<=', t + '\uf8ff'), limit(5))));
                if (t === rawTerm) {
                    queryPromises.push(getDocs(query(baseQuery, where('lotNumber', '>=', t), where('lotNumber', '<=', t + '\uf8ff'), limit(10))));
                }
            });

            const snapshots = await Promise.all(queryPromises);
            const resultMap = new Map();

            // Tìm trong Cache
            const searchKey = fuzzyNormalize(term);
            const matchedProducts = allProductsCache.filter(p => {
                const isAllowed = 
                    (userRole === 'owner' || userRole === 'admin') ||
                    (userRole === 'med' && p.team === 'MED') ||
                    (userRole === 'bio' && (p.team === 'BIO' || p.team === 'Spare Part'));
                
                if (!isAllowed) return false;
                return p.normName.includes(searchKey) || p.normId.includes(searchKey);
            }).slice(0, 15);

            matchedProducts.forEach(p => {
                const uniqueKey = `PROD_${p.id}`;
                resultMap.set(uniqueKey, {
                    key: uniqueKey,
                    type: 'product',
                    value: p.id,
                    subText: p.productName,
                    queryId: p.id,
                    lotNumberQuery: null
                });
            });

            // Tìm trong Firestore
            snapshots.forEach(snap => {
                snap.docs.forEach(d => {
                    const data = d.data();
                    const isLotMatch = searchTerms[0] === (data.lotNumber || '').toUpperCase(); 
                    const uniqueKey = isLotMatch 
                        ? `LOT_${data.lotNumber}_${data.productId}` 
                        : `PROD_${data.productId}`;

                    if (isLotMatch) {
                        resultMap.set(uniqueKey, {
                            key: uniqueKey,
                            type: 'lot',
                            value: data.lotNumber,
                            subText: `Thuộc mã: ${data.productId}`,
                            queryId: data.productId,
                            lotNumberQuery: data.lotNumber
                        });
                    } else if (!resultMap.has(uniqueKey)) {
                        resultMap.set(uniqueKey, {
                            key: uniqueKey,
                            type: 'product',
                            value: data.productId,
                            subText: data.productName,
                            queryId: data.productId,
                            lotNumberQuery: null
                        });
                    }
                });
            });

            const results = Array.from(resultMap.values());
            const cleanInput = rawTerm.toLowerCase().replace(/-/g, '');

            const exactMatch = results.find(item => {
                const val = (item.value || '').toLowerCase().replace(/-/g, '');
                const qId = (item.queryId || '').toLowerCase().replace(/-/g, '');
                const lot = (item.lotNumberQuery || '').toLowerCase().replace(/-/g, ''); 
                return val === cleanInput || qId === cleanInput || lot === cleanInput;
            });

            if (exactMatch) {
                handleSelectCandidate(exactMatch);
                setCandidates([]); 
                setLoading(false);
                return;
            }

            setCandidates(results); 

        } catch (error) {
            console.error("Lỗi tìm kiếm:", error);
            toast.error("Lỗi khi tìm kiếm.");
        } finally {
            setLoading(false);
        }
    }, [userRole, allProductsCache]);

    // --- HÀM XEM CHI TIẾT ---
    const handleSelectCandidate = async (candidate) => {
        setLoading(true);
        try {
            const productId = candidate.queryId;
            const productDocRef = doc(db, 'products', productId);
            const productSnap = await getDoc(productDocRef);
            const productInfo = productSnap.exists() ? productSnap.data() : null;

            if (!productInfo) {
                toast.warn("Không tìm thấy thông tin sản phẩm này.");
                setLoading(false);
                return;
            }

            const lotsRef = collection(db, 'inventory_lots');
            const q = query(lotsRef, where('productId', '==', productId), where('quantityRemaining', '>', 0));
            const lotsSnap = await getDocs(q);
            
            const lots = lotsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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
                generalInfo: { ...productInfo, productId },
                lots: aggregatedLots.sort((a, b) => {
                    const dateA = a.expiryDate ? a.expiryDate.toDate().getTime() : Infinity;
                    const dateB = b.expiryDate ? b.expiryDate.toDate().getTime() : Infinity;
                    if (dateA !== dateB) return dateA - dateB;
                    return a.quantityRemaining - b.quantityRemaining;
                }),
                totalRemaining
            });

        } catch (error) {
            console.error("Lỗi tải chi tiết:", error);
            toast.error("Không thể tải chi tiết.");
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

    const handleVoiceSearch = async () => {
        // Kiểm tra hỗ trợ micro trước khi gọi
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            toast.error("Trình duyệt này không hỗ trợ tìm kiếm bằng giọng nói.");
            return;
        }
        if (isListening) { mediaRecorderRef.current?.stop(); setIsListening(false); return; }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
            audioChunksRef.current = [];
            mediaRecorderRef.current.ondataavailable = (event) => audioChunksRef.current.push(event.data);
            mediaRecorderRef.current.onstop = async () => {
                stream.getTracks().forEach(track => track.stop());
                toast.info("Đang xử lý âm thanh...");
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm; codecs=opus' });
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result.split(',')[1];
                    try {
                        const transcribe = httpsCallable(functionsAsia, 'transcribeAudio');
                        const result = await transcribe({ audioData: base64Audio });
                        const transcript = result.data.transcript;
                        if (transcript) {
                            setSearchTerm(transcript.replace(/\s+/g, ''));
                            setSelectedProductData(null); 
                            toast.success("Đã nhận dạng!");
                        } else { toast.warn("Không nghe rõ."); }
                    } catch (error) { console.error(error); toast.error("Lỗi máy chủ."); }
                };
            };
            mediaRecorderRef.current.start();
            setIsListening(true);
            toast.info("🎤 Nói ngay...");
        } catch (err) { console.error(err); toast.error("Lỗi micro."); }
    };

    const handleBackToList = () => {
        setSelectedProductData(null);
    };

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        await fetchAllProducts(true);
        setIsRefreshing(false);
    };

    return (
        <div
            className={styles.container}
            ref={containerRef}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div className={styles.header}>
                <img src={companyLogo} alt="Logo" className={styles.headerLogo} />
                <h2>Tra cứu tồn kho</h2>
                <button
                    onClick={handleManualRefresh}
                    className={styles.refreshButton}
                    disabled={isRefreshing}
                    title="Làm mới danh sách sản phẩm"
                >
                    <FiRefreshCw className={isRefreshing ? styles.spinning : ''} />
                </button>
            </div>

            {/* Pull-to-refresh indicator */}
            {isRefreshing && (
                <div className={styles.pullRefreshIndicator}>
                    <FiRefreshCw className={styles.spinning} /> Đang cập nhật...
                </div>
            )}
            
            {/* Ô tìm kiếm luôn hiển thị */}
            <div className={styles.searchBox}>
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setSelectedProductData(null); }}
                    placeholder={isCacheReady ? "Nhập Mã hàng hoặc Số lô..." : "Đang tải dữ liệu..."}
                    disabled={!isCacheReady}
                    autoFocus
                />
                <FiSearch className={styles.searchIcon} />
                <button onClick={handleVoiceSearch} className={`${styles.voiceButton} ${isListening ? styles.listening : ''}`}>
                    <FiMic />
                </button>
            </div>

            {loading ? <Spinner /> : (
                <>
                    {/* TRƯỜNG HỢP 1: HIỂN THỊ DANH SÁCH GỢI Ý */}
                    {!selectedProductData && candidates.length > 0 && (
                        <div className={styles.resultsContainer}>
                            <p style={{fontSize: '13px', color: '#666', margin: '0 0 10px 5px'}}>Tìm thấy {candidates.length} kết quả:</p>
                            {candidates.map(item => (
                                <div 
                                    key={item.key} 
                                    className={styles.generalInfoCard} 
                                    style={{marginBottom: '10px', cursor: 'pointer', borderLeft: item.type === 'product' ? '5px solid #007bff' : '5px solid #28a745'}}
                                    onClick={() => handleSelectCandidate(item)}
                                >
                                    <div style={{display: 'flex', alignItems: 'center', gap: '15px'}}>
                                        <div style={{fontSize: '24px', color: item.type === 'product' ? '#007bff' : '#28a745'}}>
                                            {item.type === 'product' ? <FiBox /> : <FiLayers />}
                                        </div>
                                        <div>
                                            <h3 style={{margin: '0 0 5px 0', fontSize: '16px', color: '#333'}}>
                                                <HighlightText text={item.value} highlight={searchTerm} />
                                            </h3>
                                            <p style={{margin: 0, fontSize: '13px', color: '#666'}}>
                                                <HighlightText text={item.subText} highlight={searchTerm} />
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* TRƯỜNG HỢP 2: HIỂN THỊ CHI TIẾT SẢN PHẨM */}
                    {selectedProductData && (
                        <div className={styles.resultsContainer}>
                            <button onClick={handleBackToList} className={styles.backButton}>
                                <FiArrowLeft /> Quay lại danh sách
                            </button>

                            <div className={styles.generalInfoCard}>
                                <h3><HighlightText text={selectedProductData.generalInfo.productName} highlight={searchTerm} /></h3>
                                <div className={styles.infoGrid}>
                                    <div><strong>Mã hàng:</strong><span><HighlightText text={selectedProductData.generalInfo.productId} highlight={searchTerm} /></span></div>
                                    <div><strong>ĐVT:</strong><span>{selectedProductData.generalInfo.unit}</span></div>
                                    <div><strong>Quy cách:</strong><span>{selectedProductData.generalInfo.packaging}</span></div>
                                    <div><strong>Nhiệt độ BQ:</strong><span>{selectedProductData.generalInfo.storageTemp}</span></div>
                                    <div><strong>Hãng SX:</strong><span>{selectedProductData.generalInfo.manufacturer}</span></div>
                                    <div><strong>Team:</strong><span>{selectedProductData.generalInfo.team}</span></div>
                                    <div><strong>Nhóm hàng:</strong><span>{selectedProductData.generalInfo.subGroup}</span></div>
                                </div>
                                <div className={styles.totalInfo}>
                                    <strong>Tổng tồn:</strong>
                                    <span>{formatNumber(selectedProductData.totalRemaining)} {selectedProductData.generalInfo.unit}</span>
                                </div>
                            </div>

                            <div className={styles.lotListCard}>
                                <h3>Chi tiết lô (FEFO)</h3>
                                {selectedProductData.lots.length > 0 ? (
                                    selectedProductData.lots.map(lot => {
                                        const colorClass = getRowColorByExpiry(lot.expiryDate, selectedProductData.generalInfo.subGroup);
                                        return (
                                            <div key={lot.id} className={`${styles.lotItem} ${styles[colorClass] || ''}`}>
                                                <div>
                                                    <strong>Số lô:</strong>
                                                    <span>
                                                        {lot.lotNumber
                                                            ? <HighlightText text={lot.lotNumber} highlight={searchTerm} />
                                                            : <em style={{color: '#aaa'}}>(Không có)</em>
                                                        }
                                                    </span>
                                                </div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                    <strong>HSD:</strong>
                                                    <div style={{ textAlign: 'right', width: '60%' }}>
                                                        <ExpiryBadge expiryDate={lot.expiryDate} subGroup={selectedProductData.generalInfo.subGroup} compact={true} showProgressBar={false} />
                                                    </div>
                                                </div>
                                                <div><strong>Tồn:</strong><span>{formatNumber(lot.quantityRemaining)}</span></div>
                                                {lot.notes && <div><strong>Ghi chú:</strong><span>{lot.notes}</span></div>}
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className={styles.emptyMessage}>
                                        <FiAlertCircle size={28} color="#ccc" />
                                        <p>Không có tồn kho.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* TRƯỜNG HỢP 3: KHÔNG TÌM THẤY */}
                    {!selectedProductData && candidates.length === 0 && searchTerm && !loading && (
                        <div className={styles.noResults}> 
                            <FiAlertCircle />
                            <p>Không tìm thấy kết quả nào phù hợp.</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default MobileInventoryPage;
