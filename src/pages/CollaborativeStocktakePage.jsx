// src/pages/CollaborativeStocktakePage.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { doc, getDoc, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { useAuth } from '../context/UserContext';
import { toast } from 'react-toastify';
import { FiSearch, FiX, FiArrowLeft, FiAlertTriangle, FiCheckCircle, FiWifi, FiWifiOff } from 'react-icons/fi';
import Spinner from '../components/Spinner';
import { formatNumber } from '../utils/numberUtils';
import { writeCountEntry, subscribeToCountEntries } from '../services/collaborativeStocktakeService';
import useCollaborativeStocktakeStore from '../stores/collaborativeStocktakeStore';
import companyLogo from '../assets/logo.png';

const fuzzyNormalize = (str) => {
    if (!str) return '';
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "");
};

const CollaborativeStocktakePage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    const { sessionData, myEntries, conflicts, progress, loading, initSession, setCountEntries, setTotalLots, clearStore } = useCollaborativeStocktakeStore();

    const [searchTerm, setSearchTerm] = useState('');
    const [lotResults, setLotResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedLot, setSelectedLot] = useState(null);
    const [countedQty, setCountedQty] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [allProductsCache, setAllProductsCache] = useState([]);

    const searchInputRef = useRef(null);

    // Online/offline detection
    useEffect(() => {
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
    }, []);

    // Load session data và validate participant
    useEffect(() => {
        const loadSession = async () => {
            const sessionRef = doc(db, 'stocktakes', sessionId);
            const snap = await getDoc(sessionRef);
            if (!snap.exists()) {
                toast.error('Không tìm thấy phiên kiểm kê');
                navigate('/view');
                return;
            }
            const data = { id: snap.id, ...snap.data() };

            // Kiểm tra quyền truy cập
            if (!data.participantUids?.includes(user.uid)) {
                toast.error('Bạn không có quyền truy cập phiên này');
                navigate('/view');
                return;
            }
            if (data.status === 'adjusted') {
                toast.warn('Phiên kiểm kê này đã kết thúc');
            }

            // Lấy tổng số lô của phiên từ items subcollection
            const itemsSnap = await getDocs(collection(db, 'stocktakes', sessionId, 'items'));
            initSession(data, itemsSnap.size);
        };
        loadSession();
        return () => clearStore();
    }, [sessionId, user.uid, navigate, initSession, clearStore]);

    // Realtime listener cho count_entries
    useEffect(() => {
        if (!sessionId || !user?.uid) return;
        const unsubscribe = subscribeToCountEntries(sessionId, (entries) => {
            setCountEntries(entries, user.uid, progress.total);
        });
        return () => unsubscribe();
    }, [sessionId, user?.uid, setCountEntries, progress.total]);

    // Load cache sản phẩm để tìm kiếm
    useEffect(() => {
        const loadCache = async () => {
            const snap = await getDocs(query(collection(db, 'products')));
            setAllProductsCache(snap.docs.map(d => ({
                id: d.id,
                productName: d.data().productName || '',
                normName: fuzzyNormalize(d.data().productName),
                normId: fuzzyNormalize(d.id),
            })));
        };
        loadCache();
    }, []);

    // Tìm kiếm lô hàng
    const handleSearch = useCallback(async (term) => {
        if (!term || term.length < 2) { setLotResults([]); return; }
        setSearchLoading(true);
        try {
            const upper = term.trim().toUpperCase();
            const lotsRef = collection(db, 'inventory_lots');

            // Tìm theo productId
            const byProductId = await getDocs(query(lotsRef,
                where('productId', '>=', upper),
                where('productId', '<=', upper + '\uf8ff'),
                limit(10)
            ));
            // Tìm theo lotNumber
            const byLotNumber = await getDocs(query(lotsRef,
                where('lotNumber', '>=', upper),
                where('lotNumber', '<=', upper + '\uf8ff'),
                limit(10)
            ));

            const resultMap = new Map();
            [...byProductId.docs, ...byLotNumber.docs].forEach(d => {
                if (!resultMap.has(d.id)) resultMap.set(d.id, { id: d.id, ...d.data() });
            });

            // Tìm theo tên sản phẩm từ cache
            const searchKey = fuzzyNormalize(term);
            const matchedProductIds = allProductsCache
                .filter(p => p.normName.includes(searchKey) || p.normId.includes(searchKey))
                .map(p => p.id)
                .slice(0, 5);

            for (const productId of matchedProductIds) {
                const snap = await getDocs(query(lotsRef,
                    where('productId', '==', productId),
                    where('quantityRemaining', '>', 0),
                    limit(5)
                ));
                snap.docs.forEach(d => {
                    if (!resultMap.has(d.id)) resultMap.set(d.id, { id: d.id, ...d.data() });
                });
            }

            setLotResults(Array.from(resultMap.values()).slice(0, 20));
        } catch (err) {
            console.error('Lỗi tìm kiếm:', err);
        } finally {
            setSearchLoading(false);
        }
    }, [allProductsCache]);

    useEffect(() => {
        const debounce = setTimeout(() => handleSearch(searchTerm), 400);
        return () => clearTimeout(debounce);
    }, [searchTerm, handleSearch]);

    const handleSelectLot = (lot) => {
        setSelectedLot(lot);
        // Điền sẵn số lượng nếu đã nhập trước đó
        const existing = myEntries.find(e => e.lotId === lot.id);
        setCountedQty(existing ? String(existing.countedQty) : '');
        setNote(existing?.note || '');
    };

    const handleSubmitCount = async () => {
        if (!selectedLot) return;
        const qty = parseFloat(countedQty);
        if (isNaN(qty) || qty < 0) {
            toast.warn('Số lượng không hợp lệ (phải >= 0)');
            return;
        }
        setSubmitting(true);
        try {
            await writeCountEntry(sessionId, selectedLot.id, qty, user.uid, note);
            toast.success(`Đã lưu: ${selectedLot.productId} - Lô ${selectedLot.lotNumber || 'N/A'}`);
            setSelectedLot(null);
            setCountedQty('');
            setNote('');
            setSearchTerm('');
            setLotResults([]);
            searchInputRef.current?.focus();
        } catch (err) {
            toast.error(err.message || 'Lỗi khi lưu số liệu');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) return <Spinner />;
    if (!sessionData) return null;

    const isSessionClosed = sessionData.status === 'adjusted';
    const myConflicts = conflicts.filter(e => e.enteredBy === user.uid);

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '12px', fontFamily: 'sans-serif' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #e0e0e0' }}>
                <button onClick={() => navigate('/view')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#555', padding: '4px' }}>
                    <FiArrowLeft />
                </button>
                <img src={companyLogo} alt="Logo" style={{ height: '32px' }} />
                <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: '15px' }}>{sessionData.name}</div>
                    <div style={{ fontSize: '12px', color: '#888' }}>Kiểm kê cộng tác</div>
                </div>
                {isOnline
                    ? <FiWifi style={{ color: '#28a745', fontSize: '18px' }} title="Đang kết nối" />
                    : <FiWifiOff style={{ color: '#dc3545', fontSize: '18px' }} title="Mất kết nối" />
                }
            </div>

            {/* Offline banner */}
            {!isOnline && (
                <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#856404', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FiWifiOff /> Mất kết nối — dữ liệu sẽ đồng bộ khi có mạng
                </div>
            )}

            {/* Session closed banner */}
            {isSessionClosed && (
                <div style={{ background: '#f8d7da', border: '1px solid #dc3545', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px', fontSize: '13px', color: '#721c24' }}>
                    Phiên kiểm kê đã kết thúc. Không thể nhập thêm dữ liệu.
                </div>
            )}

            {/* Progress */}
            <div style={{ background: '#fff', borderRadius: '10px', padding: '14px', marginBottom: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '13px' }}>
                    <span style={{ color: '#555' }}>Tiến độ tổng thể</span>
                    <span style={{ fontWeight: 600 }}>{progress.counted}/{progress.total} lô ({progress.percent}%)</span>
                </div>
                <div style={{ height: '8px', background: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                        height: '100%', borderRadius: '4px', transition: 'width 0.3s',
                        width: `${progress.percent}%`,
                        background: progress.percent >= 80 ? '#28a745' : progress.percent >= 50 ? '#ffc107' : '#007bff'
                    }} />
                </div>
                <div style={{ marginTop: '6px', fontSize: '12px', color: '#888' }}>
                    Bạn đã nhập: {myEntries.filter(e => !e.rejected).length} lô
                </div>
            </div>

            {/* Conflict warnings */}
            {myConflicts.length > 0 && (
                <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '10px 14px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', color: '#856404', marginBottom: '6px' }}>
                        <FiAlertTriangle /> {myConflicts.length} xung đột cần owner giải quyết
                    </div>
                    {myConflicts.map(e => (
                        <div key={e.id} style={{ fontSize: '12px', color: '#856404' }}>
                            • {e.productId} - Lô {e.lotNumber || 'N/A'}: số lượng của bạn = {formatNumber(e.countedQty)}
                        </div>
                    ))}
                </div>
            )}

            {/* Search box */}
            {!isSessionClosed && (
                <div style={{ position: 'relative', marginBottom: '14px' }}>
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchTerm}
                        onChange={e => { setSearchTerm(e.target.value); setSelectedLot(null); }}
                        placeholder="Nhập mã hàng, số lô hoặc tên sản phẩm..."
                        style={{ width: '100%', padding: '12px 40px 12px 16px', borderRadius: '25px', border: '1px solid #ddd', fontSize: '15px', boxSizing: 'border-box', outline: 'none' }}
                        autoFocus
                    />
                    {searchTerm
                        ? <FiX onClick={() => { setSearchTerm(''); setLotResults([]); setSelectedLot(null); }} style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', cursor: 'pointer', color: '#888', fontSize: '18px' }} />
                        : <FiSearch style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', color: '#888', fontSize: '18px' }} />
                    }
                </div>
            )}

            {/* Lot results */}
            {searchLoading && <div style={{ textAlign: 'center', color: '#888', padding: '10px' }}>Đang tìm...</div>}

            {!selectedLot && lotResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
                    {lotResults.map(lot => {
                        const myEntry = myEntries.find(e => e.lotId === lot.id && !e.rejected);
                        const hasConflict = conflicts.some(e => e.lotId === lot.id);
                        return (
                            <div key={lot.id} onClick={() => handleSelectLot(lot)}
                                style={{ background: '#fff', borderRadius: '10px', padding: '12px 16px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', cursor: 'pointer', borderLeft: hasConflict ? '4px solid #ffc107' : myEntry ? '4px solid #28a745' : '4px solid #007bff' }}>
                                <div style={{ fontWeight: 600, fontSize: '14px' }}>{lot.productId}</div>
                                <div style={{ fontSize: '13px', color: '#555', marginTop: '2px' }}>{lot.productName}</div>
                                <div style={{ display: 'flex', gap: '12px', marginTop: '6px', fontSize: '12px', color: '#888' }}>
                                    <span>Lô: {lot.lotNumber || 'N/A'}</span>
                                    <span>Tồn HT: {formatNumber(lot.quantityRemaining)} {lot.unit}</span>
                                    {myEntry && <span style={{ color: '#28a745', fontWeight: 600 }}><FiCheckCircle /> Đã nhập: {formatNumber(myEntry.countedQty)}</span>}
                                    {hasConflict && <span style={{ color: '#856404' }}><FiAlertTriangle /> Xung đột</span>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Count input form */}
            {selectedLot && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div>
                            <div style={{ fontWeight: 700, fontSize: '15px' }}>{selectedLot.productId}</div>
                            <div style={{ fontSize: '13px', color: '#555' }}>{selectedLot.productName}</div>
                            <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>
                                Lô: {selectedLot.lotNumber || 'N/A'} | Tồn HT: {formatNumber(selectedLot.quantityRemaining)} {selectedLot.unit}
                            </div>
                        </div>
                        <button onClick={() => setSelectedLot(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '20px', padding: '4px' }}>
                            <FiX />
                        </button>
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '13px', color: '#555', display: 'block', marginBottom: '4px' }}>Số lượng đếm được (*):</label>
                        <input
                            type="number"
                            min="0"
                            value={countedQty}
                            onChange={e => setCountedQty(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmitCount()}
                            placeholder="Nhập số lượng..."
                            autoFocus
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '2px solid #007bff', fontSize: '18px', fontWeight: 600, textAlign: 'center', boxSizing: 'border-box', outline: 'none' }}
                        />
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                        <label style={{ fontSize: '13px', color: '#555', display: 'block', marginBottom: '4px' }}>Ghi chú (tùy chọn):</label>
                        <input
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Ghi chú thêm..."
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
                        />
                    </div>

                    <button
                        onClick={handleSubmitCount}
                        disabled={submitting || countedQty === ''}
                        style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: submitting ? '#ccc' : '#007bff', color: '#fff', fontSize: '16px', fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}
                    >
                        {submitting ? 'Đang lưu...' : 'Xác nhận số lượng'}
                    </button>
                </div>
            )}

            {/* My entries list */}
            {myEntries.filter(e => !e.rejected).length > 0 && (
                <div style={{ background: '#fff', borderRadius: '10px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                    <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '10px', color: '#333' }}>
                        Dữ liệu bạn đã nhập ({myEntries.filter(e => !e.rejected).length} lô)
                    </div>
                    {myEntries.filter(e => !e.rejected).map(entry => (
                        <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600 }}>{entry.productId}</div>
                                <div style={{ fontSize: '12px', color: '#888' }}>Lô: {entry.lotNumber || 'N/A'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '14px', fontWeight: 700, color: entry.conflict ? '#856404' : '#28a745' }}>
                                    {formatNumber(entry.countedQty)}
                                    {entry.conflict && <FiAlertTriangle style={{ marginLeft: '4px', color: '#ffc107' }} />}
                                </div>
                                {!isSessionClosed && (
                                    <button
                                        onClick={() => handleSelectLot({ id: entry.lotId, productId: entry.productId, productName: entry.productName, lotNumber: entry.lotNumber, quantityRemaining: 0, unit: '' })}
                                        style={{ fontSize: '11px', color: '#007bff', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                                    >
                                        Sửa
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CollaborativeStocktakePage;
