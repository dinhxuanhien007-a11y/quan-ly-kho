import React, { useState, useEffect, useCallback, useRef } from 'react';
// --- THAY ĐỔI 1: Import thêm 'app' từ config và 'httpsCallable' từ functions ---
import { db, app } from '../firebaseConfig'; 
import { getFunctions, httpsCallable } from 'firebase/functions';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { useAuth } from '../context/UserContext';
import Spinner from '../components/Spinner';
import { FiSearch, FiAlertCircle, FiMic } from 'react-icons/fi';
import styles from '../styles/MobileInventoryPage.module.css';
import { formatDate } from '../utils/dateUtils';
import { formatNumber } from '../utils/numberUtils';
import companyLogo from '../assets/logo.png';
import { toast } from 'react-toastify';

// --- THAY ĐỔI 2: Tạo một kết nối riêng đến server Châu Á ---
const functionsAsia = getFunctions(app, 'asia-southeast1');

const MobileInventoryPage = () => {
    const { role: userRole } = useAuth();
    const [searchTerm, setSearchTerm] = useState('');
    const [productData, setProductData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [isListening, setIsListening] = useState(false);
    
    // Các Ref để quản lý việc ghi âm
    const mediaRecorderRef = useRef(null);
    const audioChunksRef = useRef([]);

    const performSearch = useCallback(async (term) => {
        if (!term) {
            setProductData(null);
            return;
        }
        setLoading(true);
        try {
            const trimmedTerm = term.trim().toUpperCase();
            let baseQuery = collection(db, 'inventory_lots');
            if (userRole === 'med') {
                baseQuery = query(baseQuery, where('team', '==', 'MED'));
            } else if (userRole === 'bio') {
                baseQuery = query(baseQuery, where('team', 'in', ['BIO', 'Spare Part']));
            }
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

    const handleVoiceSearch = async () => {
        if (isListening) {
            mediaRecorderRef.current?.stop();
            setIsListening(false);
            return;
        }

        try {
            // Xin quyền truy cập micro
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Bắt đầu ghi âm
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
            audioChunksRef.current = []; // Xóa các mẩu ghi âm cũ

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            // Xử lý khi kết thúc ghi âm
            mediaRecorderRef.current.onstop = async () => {
                stream.getTracks().forEach(track => track.stop()); // Tắt micro
                toast.info("Đang xử lý âm thanh...");

                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm; codecs=opus' });
                
                // Chuyển file âm thanh thành chuỗi base64
                const reader = new FileReader();
                reader.readAsDataURL(audioBlob);
                reader.onloadend = async () => {
                    const base64Audio = reader.result.split(',')[1];
                    
                    try {
                        // --- THAY ĐỔI 3: Gọi hàm bằng kết nối đến server Châu Á ---
                        const transcribe = httpsCallable(functionsAsia, 'transcribeAudio');
                        const result = await transcribe({ audioData: base64Audio });
                        
                        const transcript = result.data.transcript;
                        if (transcript) {
                            setSearchTerm(transcript.replace(/\s+/g, ''));
                            toast.success("Đã nhận dạng!");
                        } else {
                            toast.warn("Không nghe rõ, vui lòng thử lại.");
                        }
                    } catch (error) {
                        console.error("Lỗi khi gọi Cloud Function:", error);
                        toast.error("Lỗi máy chủ khi xử lý giọng nói.");
                    }
                };
            };

            mediaRecorderRef.current.start();
            setIsListening(true);
            toast.info("🎤 Nói ngay...");

        } catch (err) {
            console.error("Lỗi khi truy cập micro:", err);
            toast.error("Không thể truy cập micro. Vui lòng cấp quyền.");
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <img src={companyLogo} alt="Logo" className={styles.headerLogo} />
                <h2>Tra cứu tồn kho</h2>
            </div>
            
            <div className={styles.searchBox}>
                <input 
                    type="text" 
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Tìm Mã hàng hoặc Số lô..."
                    autoFocus
                />
                <FiSearch className={styles.searchIcon} />
                <button
                    onClick={handleVoiceSearch}
                    className={`${styles.voiceButton} ${isListening ? styles.listening : ''}`}
                    title="Tìm kiếm bằng giọng nói"
                >
                    <FiMic />
                </button>
            </div>
            
            {loading ? (
                <Spinner />
            ) : productData ? (
                <div className={styles.resultsContainer}>
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
                <div className={styles.noResults}> 
                    <FiAlertCircle />
                    <p>{searchTerm ? 'Không tìm thấy kết quả.' : 'Vui lòng nhập từ khóa để tìm kiếm.'}</p>
                </div>
            )}
        </div>
    );
};

export default MobileInventoryPage;