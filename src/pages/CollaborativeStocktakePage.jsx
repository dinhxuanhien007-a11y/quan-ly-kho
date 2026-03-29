// src/pages/CollaborativeStocktakePage.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '../context/UserContext';
import { toast } from 'react-toastify';
import { FiSearch, FiX, FiArrowLeft, FiAlertTriangle, FiCheckCircle, FiWifi, FiWifiOff, FiLock } from 'react-icons/fi';
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
    const { user, loading: authLoading } = useAuth();

    const { sessionData, myEntries, conflicts, progress, loading, initSession, setCountEntries, clearStore } = useCollaborativeStocktakeStore();

    // searchMode: 'typing' | 'locked' (sau khi Enter, kết quả bị lock)
    const [searchTerm, setSearchTerm] = useState('');
    const [searchMode, setSearchMode] = useState('typing'); // 'typing' | 'locked'
    const [lotResults, setLotResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedLot, setSelectedLot] = useState(null);
    const [countedQty, setCountedQty] = useState('');
    const [note, setNote] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    // allEntries: tất cả count_entries của phiên (để hiện badge đã đếm của mọi người)
    const [allEntries, setAllEntries] = useState([]);

    const searchInputRef = useRef(null);
    const qtyInputRef = useRef(null);

    useEffect(() => {
        const onOnline = () => setIsOnline(true);
        const onOffline = () => setIsOnline(false);
        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);
        return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
    }, []);

    useEffect(() => {
        if (authLoading || !user?.uid) return;
        const loadSession = async () => {
            try {
                const snap = await getDoc(doc(db, 'stocktakes', sessionId));
                if (!snap.exists()) { toast.error('Không tìm thấy phiên kiểm kê'); navigate('/view'); return; }
                const data = { id: snap.id, ...snap.data() };
                const participantUids = data.participantUids || [];
                if (!participantUids.includes(user.uid)) { toast.error('Bạn không có quyền truy cập phiên này'); navigate('/view'); return; }
                if (data.status === 'adjusted') toast.warn('Phiên kiểm kê này đã kết thúc');
                const itemsSnap = await getDocs(collection(db, 'stocktakes', sessionId, 'items'));
                initSession(data, itemsSnap.size);
            } catch (err) {
                console.error('loadSession error:', err);
                toast.error('Lỗi tải phiên kiểm kê: ' + err.message);
                navigate('/view');
            }
        };
        loadSession();
        return () => clearStore();
    }, [sessionId, user?.uid, authLoading, navigate, initSession, clearStore]);

    // Subscribe tất cả count_entries (không chỉ của mình) để hiện badge realtime
    useEffect(() => {
        if (!sessionId || !user?.uid || !sessionData) return;
        const unsubscribe = subscribeToCountEntries(sessionId, (entries) => {
            setAllEntries(entries);
            setCountEntries(entries, user.uid, progress.total);
        });
        return () => unsubscribe();
    }, [sessionId, user?.uid, sessionData, setCountEntries, progress.total]);

    // Tìm kiếm lô hàng — chỉ lấy lô có tồn kho > 0
    const doSearch = useCallback(async (term) => {
        if (!term || term.length < 2) { setLotResults([]); return; }
        setSearchLoading(true);
        try {
            const upper = term.trim().toUpperCase();
            const lotsRef = collection(db, 'inventory_lots');

            const [byProductId, byLotNumber] = await Promise.all([
                getDocs(query(lotsRef, where('productId', '>=', upper), where('productId', '<=', upper + '\uf8ff'), where('quantityRemaining', '>', 0))),
                getDocs(query(lotsRef, where('lotNumber', '>=', upper), where('lotNumber', '<=', upper + '\uf8ff'), where('quantityRemaining', '>', 0))),
            ]);

            const resultMap = new Map();
            [...byProductId.docs, ...byLotNumber.docs].forEach(d => {
                if (!resultMap.has(d.id)) resultMap.set(d.id, { id: d.id, ...d.data() });
            });

            const searchKey = fuzzyNormalize(term);
            if (searchKey.length >= 2) {
                const prodsSnap = await getDocs(collection(db, 'products'));
                const matchedIds = prodsSnap.docs
                    .filter(d => fuzzyNormalize(d.data().productName || '').includes(searchKey) || fuzzyNormalize(d.id).includes(searchKey))
                    .map(d => d.id).slice(0, 5);
                for (const productId of matchedIds) {
                    const snap = await getDocs(query(lotsRef, where('productId', '==', productId), where('quantityRemaining', '>', 0)));
                    snap.docs.forEach(d => { if (!resultMap.has(d.id)) resultMap.set(d.id, { id: d.id, ...d.data() }); });
                }
            }

            const results = Array.from(resultMap.values())
                .filter(lot => lot.quantityRemaining > 0)
                .sort((a, b) => (a.productId || '').localeCompare(b.productId || ''));
            setLotResults(results.slice(0, 30));
        } catch (err) {
            console.error('Lỗi tìm kiếm:', err);
        } finally {
            setSearchLoading(false);
        }
    }, []);

    // Debounce khi đang typing, không search khi đã locked
    useEffect(() => {
        if (searchMode === 'locked') return;
        const debounce = setTimeout(() => doSearch(searchTerm), 400);
        return () => clearTimeout(debounce);
    }, [searchTerm, searchMode, doSearch]);

    // Enter → lock kết quả
    const handleSearchKeyDown = (e) => {
        if (e.key === 'Enter' && searchTerm.trim()) {
            e.preventDefault();
            setSearchMode('locked');
            doSearch(searchTerm);
        }
    };

    // Mở khóa để gõ mã mới
    const handleUnlock = () => {
        setSearchMode('typing');
        setSelectedLot(null);
        setCountedQty('');
        setNote('');
        setTimeout(() => searchInputRef.current?.focus(), 100);
    };

    // Xóa hoàn toàn
    const handleClearSearch = () => {
        setSearchTerm('');
        setLotResults([]);
        setSelectedLot(null);
        setCountedQty('');
        setNote('');
        setSearchMode('typing');
        setTimeout(() => searchInputRef.current?.focus(), 100);
    };

    const handleSelectLot = (lot) => {
        setSelectedLot(lot);
        const myEntry = (myEntries || []).find(e => e.lotId === lot.id && !e.rejected);
        setCountedQty(myEntry ? String(myEntry.countedQty) : '');
        setNote(myEntry?.note || '');
        setTimeout(() => qtyInputRef.current?.focus(), 100);
    };

    const handleSubmitCount = async () => {
        if (!selectedLot) return;
        const qty = parseFloat(countedQty);
        if (isNaN(qty) || qty < 0) { toast.warn('Số lượng không hợp lệ (phải >= 0)'); return; }
        setSubmitting(true);
        try {
            await writeCountEntry(sessionId, selectedLot.id, qty, user.uid, note);
            toast.success(`Đã lưu: ${selectedLot.productId} - Lô ${selectedLot.lotNumber || 'N/A'}`);
            // Giữ nguyên kết quả tìm kiếm, chỉ đóng form nhập
            setSelectedLot(null);
            setCountedQty('');
            setNote('');
        } catch (err) {
            toast.error(err.message || 'Lỗi khi lưu số liệu');
        } finally {
            setSubmitting(false);
        }
    };

    if (authLoading || loading) return <Spinner />;
    if (!sessionData) return null;

    const isSessionClosed = sessionData.status === 'adjusted';
    const myValidEntries = (myEntries || []).filter(e => !e.rejected);
    const myConflicts = (conflicts || []).filter(e => e.enteredBy === user.uid);

    // Helper: lấy tất cả entries (không bị rejected) cho 1 lotId
    const getEntriesForLot = (lotId) => allEntries.filter(e => e.lotId === lotId && !e.rejected);

    return (
        <div style={{ maxWidth: '600px', margin: '0 auto', padding: '12px', background: '#f5f7fa', minHeight: '100vh', fontFamily: 'sans-serif' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px', background: '#fff', borderRadius: '12px', padding: '12px 14px', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <button onClick={() => navigate('/view')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#555', padding: '4px', flexShrink: 0 }}>
                    <FiArrowLeft />
                </button>
                <img src={companyLogo} alt="Logo" style={{ height: '30px', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sessionData.name}</div>
                    <div style={{ fontSize: '11px', color: '#888' }}>Kiểm kê cộng tác</div>
                </div>
                {isOnline ? <FiWifi style={{ color: '#28a745', fontSize: '16px', flexShrink: 0 }} /> : <FiWifiOff style={{ color: '#dc3545', fontSize: '16px', flexShrink: 0 }} />}
            </div>

            {/* Offline / Session closed banners */}
            {!isOnline && (
                <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', fontSize: '12px', color: '#856404', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <FiWifiOff /> Mất kết nối — dữ liệu sẽ đồng bộ khi có mạng
                </div>
            )}
            {isSessionClosed && (
                <div style={{ background: '#f8d7da', border: '1px solid #dc3545', borderRadius: '8px', padding: '8px 12px', marginBottom: '10px', fontSize: '12px', color: '#721c24' }}>
                    Phiên kiểm kê đã kết thúc. Không thể nhập thêm dữ liệu.
                </div>
            )}

            {/* Progress */}
            <div style={{ background: '#fff', borderRadius: '12px', padding: '12px 14px', marginBottom: '12px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '13px', color: '#555', fontWeight: 500 }}>Tiến độ tổng thể</span>
                    <span style={{ fontSize: '13px', fontWeight: 700, color: '#333' }}>{progress.counted}/{progress.total} lô ({progress.percent}%)</span>
                </div>
                <div style={{ height: '6px', background: '#e9ecef', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: '3px', transition: 'width 0.3s', width: `${progress.percent}%`, background: progress.percent >= 80 ? '#28a745' : progress.percent >= 50 ? '#ffc107' : '#007bff' }} />
                </div>
                <div style={{ marginTop: '5px', fontSize: '11px', color: '#888' }}>Bạn đã nhập: {myValidEntries.length} lô</div>
            </div>

            {/* Conflict warnings */}
            {myConflicts.length > 0 && (
                <div style={{ background: '#fff8e1', border: '1px solid #ffca28', borderRadius: '10px', padding: '10px 12px', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600, fontSize: '13px', color: '#e65100', marginBottom: '4px' }}>
                        <FiAlertTriangle /> {myConflicts.length} xung đột cần owner giải quyết
                    </div>
                    {myConflicts.map(e => (
                        <div key={e.id} style={{ fontSize: '12px', color: '#bf360c' }}>
                            • {e.productId} - Lô {e.lotNumber || 'N/A'}: {formatNumber(e.countedQty)}
                        </div>
                    ))}
                </div>
            )}

            {/* Search box */}
            {!isSessionClosed && (
                <div style={{ position: 'relative', marginBottom: '12px' }}>
                    <input
                        ref={searchInputRef}
                        type="text"
                        value={searchTerm}
                        onChange={e => { if (searchMode === 'locked') return; setSearchTerm(e.target.value); setSelectedLot(null); }}
                        onKeyDown={handleSearchKeyDown}
                        placeholder={searchMode === 'locked' ? 'Nhấn 🔓 để tìm mã khác...' : 'Nhập mã hàng rồi nhấn Enter...'}
                        readOnly={searchMode === 'locked'}
                        style={{
                            width: '100%', padding: '12px 80px 12px 16px', borderRadius: '25px',
                            border: searchMode === 'locked' ? '2px solid #28a745' : '2px solid #e0e0e0',
                            fontSize: '15px', boxSizing: 'border-box', outline: 'none',
                            background: searchMode === 'locked' ? '#f0fff4' : '#fff',
                            color: '#1a1a1a', fontWeight: searchMode === 'locked' ? 600 : 400
                        }}
                        autoFocus
                    />
                    <div style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', display: 'flex', gap: '4px', alignItems: 'center' }}>
                        {searchMode === 'locked' ? (
                            <button onClick={handleUnlock} title="Tìm mã khác" style={{ background: '#28a745', border: 'none', cursor: 'pointer', color: '#fff', fontSize: '13px', padding: '4px 10px', borderRadius: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <FiLock size={12} /> Đổi mã
                            </button>
                        ) : (
                            searchTerm
                                ? <FiX onClick={handleClearSearch} style={{ cursor: 'pointer', color: '#666', fontSize: '18px' }} />
                                : <FiSearch style={{ color: '#999', fontSize: '18px' }} />
                        )}
                    </div>
                </div>
            )}

            {searchMode === 'typing' && !searchTerm && (
                <div style={{ textAlign: 'center', color: '#aaa', fontSize: '13px', padding: '20px 0' }}>
                    Nhập mã hàng rồi nhấn <strong>Enter</strong> để tìm kiếm
                </div>
            )}

            {searchLoading && <div style={{ textAlign: 'center', color: '#888', padding: '10px', fontSize: '13px' }}>Đang tìm...</div>}

            {/* Form nhập số lượng */}
            {selectedLot && (
                <div style={{ background: '#fff', borderRadius: '14px', padding: '16px', boxShadow: '0 2px 12px rgba(0,0,0,0.1)', marginBottom: '12px', border: '2px solid #007bff' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700, fontSize: '15px', color: '#1a1a1a' }}>{selectedLot.productId}</div>
                            <div style={{ fontSize: '13px', color: '#555', marginTop: '2px' }}>{selectedLot.productName}</div>
                            <div style={{ fontSize: '12px', color: '#777', marginTop: '4px' }}>
                                Lô: <strong>{selectedLot.lotNumber || 'N/A'}</strong> | Tồn HT: <strong style={{ color: '#007bff' }}>{formatNumber(selectedLot.quantityRemaining)} {selectedLot.unit}</strong>
                            </div>
                        </div>
                        <button onClick={() => { setSelectedLot(null); setCountedQty(''); setNote(''); }} style={{ background: '#f5f5f5', border: 'none', cursor: 'pointer', color: '#666', fontSize: '16px', padding: '6px', borderRadius: '50%', flexShrink: 0 }}>
                            <FiX />
                        </button>
                    </div>

                    <div style={{ marginBottom: '10px' }}>
                        <label style={{ fontSize: '13px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Số lượng đếm được (*):</label>
                        <input
                            ref={qtyInputRef}
                            type="number"
                            min="0"
                            value={countedQty}
                            onChange={e => setCountedQty(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmitCount()}
                            placeholder="0"
                            style={{ width: '100%', padding: '14px', borderRadius: '10px', border: '2px solid #007bff', fontSize: '22px', fontWeight: 700, textAlign: 'center', boxSizing: 'border-box', outline: 'none', color: '#1a1a1a', background: '#f8f9ff' }}
                        />
                    </div>

                    <div style={{ marginBottom: '14px' }}>
                        <label style={{ fontSize: '13px', color: '#555', display: 'block', marginBottom: '6px', fontWeight: 500 }}>Ghi chú (tùy chọn):</label>
                        <input
                            type="text"
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSubmitCount()}
                            placeholder="Ghi chú thêm..."
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ddd', fontSize: '14px', boxSizing: 'border-box', outline: 'none', color: '#333' }}
                        />
                    </div>

                    <button
                        onClick={handleSubmitCount}
                        disabled={submitting || countedQty === ''}
                        style={{ width: '100%', padding: '14px', borderRadius: '10px', border: 'none', background: (submitting || countedQty === '') ? '#b0bec5' : '#007bff', color: '#fff', fontSize: '16px', fontWeight: 700, cursor: (submitting || countedQty === '') ? 'not-allowed' : 'pointer' }}
                    >
                        {submitting ? 'Đang lưu...' : 'Xác nhận số lượng'}
                    </button>
                </div>
            )}

            {/* Danh sách lô — hiện badge đã đếm của TẤT CẢ mọi người */}
            {lotResults.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                    {lotResults.map(lot => {
                        const entriesForLot = getEntriesForLot(lot.id);
                        const myEntry = entriesForLot.find(e => e.enteredBy === user.uid);
                        const othersEntries = entriesForLot.filter(e => e.enteredBy !== user.uid);
                        const hasConflict = (conflicts || []).some(e => e.lotId === lot.id);
                        const isSelected = selectedLot?.id === lot.id;
                        const isCountedByAnyone = entriesForLot.length > 0;

                        return (
                            <div key={lot.id} onClick={() => handleSelectLot(lot)}
                                style={{
                                    background: isSelected ? '#e8f4fd' : myEntry ? '#f0fff4' : isCountedByAnyone ? '#fffde7' : '#fff',
                                    borderRadius: '10px',
                                    padding: '12px 14px',
                                    boxShadow: isSelected ? '0 2px 8px rgba(0,123,255,0.2)' : '0 1px 3px rgba(0,0,0,0.08)',
                                    cursor: 'pointer',
                                    borderLeft: hasConflict ? '4px solid #ffca28' : isSelected ? '4px solid #0056b3' : myEntry ? '4px solid #28a745' : isCountedByAnyone ? '4px solid #ffc107' : '4px solid #007bff',
                                    outline: isSelected ? '2px solid #007bff' : 'none',
                                }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: '14px', color: '#1a1a1a' }}>{lot.productId}</div>
                                        <div style={{ fontSize: '12px', color: '#555', marginTop: '2px' }}>{lot.productName}</div>
                                        <div style={{ display: 'flex', gap: '10px', marginTop: '5px', fontSize: '12px', color: '#777', flexWrap: 'wrap' }}>
                                            <span>Lô: <strong style={{ color: '#333' }}>{lot.lotNumber || 'N/A'}</strong></span>
                                            <span>Tồn HT: <strong style={{ color: '#007bff' }}>{formatNumber(lot.quantityRemaining)} {lot.unit}</strong></span>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '8px', display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'flex-end' }}>
                                        {/* Badge số lượng của mình */}
                                        {myEntry && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#28a745', fontWeight: 700, fontSize: '13px' }}>
                                                <FiCheckCircle size={12} /> Bạn: {formatNumber(myEntry.countedQty)}
                                            </div>
                                        )}
                                        {/* Badge số lượng của người khác */}
                                        {othersEntries.map(e => (
                                            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#e65100', fontWeight: 600, fontSize: '12px' }}>
                                                <FiAlertTriangle size={11} /> Cộng tác: {formatNumber(e.countedQty)}
                                            </div>
                                        ))}
                                        {hasConflict && <div style={{ color: '#e65100', fontSize: '11px', fontWeight: 600 }}>⚠ Xung đột</div>}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Dữ liệu đã nhập */}
            {myValidEntries.length > 0 && (
                <div style={{ background: '#fff', borderRadius: '12px', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px', marginBottom: '10px', color: '#1a1a1a' }}>
                        Dữ liệu bạn đã nhập ({myValidEntries.length} lô)
                    </div>
                    {myValidEntries.map(entry => (
                        <div key={entry.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
                            <div>
                                <div style={{ fontSize: '13px', fontWeight: 600, color: '#1a1a1a' }}>{entry.productId}</div>
                                <div style={{ fontSize: '11px', color: '#888' }}>Lô: {entry.lotNumber || 'N/A'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '15px', fontWeight: 700, color: entry.conflict ? '#e65100' : '#28a745' }}>
                                    {formatNumber(entry.countedQty)}
                                    {entry.conflict && <FiAlertTriangle style={{ marginLeft: '4px', fontSize: '12px' }} />}
                                </div>
                                {!isSessionClosed && (
                                    <button
                                        onClick={() => handleSelectLot({ id: entry.lotId, productId: entry.productId, productName: entry.productName, lotNumber: entry.lotNumber, quantityRemaining: 0, unit: '' })}
                                        style={{ fontSize: '11px', color: '#007bff', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 500 }}
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
