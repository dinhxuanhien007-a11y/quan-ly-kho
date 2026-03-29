// src/pages/StocktakeSessionPage.jsx
import { FiPrinter, FiUsers, FiAlertTriangle } from 'react-icons/fi';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { doc, getDoc, updateDoc, writeBatch, collection, serverTimestamp, query, orderBy, limit, startAfter, getDocs, where, getCountFromServer, setDoc, Timestamp, onSnapshot } from 'firebase/firestore';
import '../styles/StocktakePage.css';
import AddUnlistedItemModal from '../components/AddUnlistedItemModal';
import ConfirmationModal from '../components/ConfirmationModal';
import ConflictResolutionModal from '../components/ConflictResolutionModal';
import { formatDate, parseDateString, getRowColorByExpiry } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import useStocktakeStore from '../stores/stocktakeStore';
import { subscribeToCountEntries, reconcileSession } from '../services/collaborativeStocktakeService';
import { useAuth } from '../context/UserContext';
import { formatNumber } from '../utils/numberUtils';

const PAGE_SIZE = 50;

// Component con không thay đổi
// Tạo âm thanh beep nhẹ bằng Web Audio API (không cần file âm thanh)
const playBeep = () => {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, ctx.currentTime);
        gainNode.gain.setValueAtTime(0.1, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + 0.15);
    } catch (_) { /* bỏ qua nếu trình duyệt không hỗ trợ */ }
};

const CountInput = ({ item, onCountSubmit, onResetCount, inputRef }) => {
    const { id, countedQty, isNew } = item;
    const updateItemCountInUI = useStocktakeStore(state => state.updateItemCountInUI);
    const sessionData = useStocktakeStore(state => state.sessionData);
    const isSessionInProgress = sessionData?.status === 'in_progress' || sessionData?.status === 'active';
    const hasCounted = countedQty !== null && countedQty !== undefined && countedQty !== '';

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    };

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <input
                ref={inputRef}
                type="text"
                placeholder="Nhập số đếm"
                value={countedQty ?? ''}
                onChange={e => updateItemCountInUI(id, e.target.value)}
                onBlur={e => onCountSubmit(id, e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!isSessionInProgress}
                style={{
                    flex: 1,
                    boxSizing: 'border-box',
                    backgroundColor: isNew ? '#fff9e6' : (hasCounted ? '#e6fffa' : '#fff')
                }}
            />
            {isSessionInProgress && hasCounted && (
                <button
                    onClick={() => onResetCount(id)}
                    title="Xóa số đếm"
                    style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: '#aaa', fontSize: '14px', padding: '2px 4px',
                        lineHeight: 1, flexShrink: 0
                    }}
                >
                    ✕
                </button>
            )}
        </div>
    );
};

// Component ghi chú cho từng dòng kiểm kê
const NoteInput = ({ item, onNoteSubmit }) => {
    const { id, countNote } = item;
    const sessionData = useStocktakeStore(state => state.sessionData);
    const isSessionInProgress = sessionData?.status === 'in_progress' || sessionData?.status === 'active';
    const [localNote, setLocalNote] = React.useState(countNote || '');

    React.useEffect(() => { setLocalNote(countNote || ''); }, [countNote]);

    return (
        <input
            type="text"
            placeholder="Ghi chú..."
            value={localNote}
            onChange={e => setLocalNote(e.target.value)}
            onBlur={() => onNoteSubmit(id, localNote)}
            disabled={!isSessionInProgress}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: '12px', color: '#555' }}
        />
    );
};

/**
 * Tính toán một biểu thức toán học đơn giản một cách an toàn.
 * Hỗ trợ các chuỗi như "300+200", "600-100".
 */
const evaluateMathExpression = (str) => {
    try {
        if (/[^0-9\s+\-]/.test(str)) {
            return NaN;
        }
        const sanitizedStr = str.replace(/--/g, '+');
        return new Function(`return ${sanitizedStr}`)();
    } catch (error) {
        return NaN;
    }
};

const StocktakeSessionPage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const {
        sessionData, items, discrepancyItems, checkedItems, summaryStats, loading,
        initializeSession, setItems, setSummary, setSessionStatus,
        toggleCheckedItem, toggleAllCheckedItems, clearStore, updateItemCountInUI
    } = useStocktakeStore();

    const [loadingItems, setLoadingItems] = useState(true);
    const [convMap, setConvMap] = useState({});
    const [searchTerm, setSearchTerm] = useState('');
    const [filterMode, setFilterMode] = useState('all'); // 'all' | 'uncounted' | 'counted'
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    const [isLastPage, setIsLastPage] = useState(false);
    const [cursorHistory, setCursorHistory] = useState([]);
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });
    const [justSavedId, setJustSavedId] = useState(null); // highlight dòng vừa lưu
    const [adjustmentHistory, setAdjustmentHistory] = useState([]); // lịch sử điều chỉnh
    const [suggestions, setSuggestions] = useState([]); // gợi ý mã hàng khi gõ
    const [productIdCache, setProductIdCache] = useState([]); // cache toàn bộ productId của phiên
    const [isCacheLoading, setIsCacheLoading] = useState(true); // trạng thái load cache

    // --- COLLABORATIVE STATE ---
    const [collabEntries, setCollabEntries] = useState([]);
    const [conflictModal, setConflictModal] = useState({ isOpen: false, conflict: null });
    const { user } = useAuth();

    const tableContainerRef = useRef(null); // ref để scroll lên đầu bảng khi chuyển trang
    const firstCountInputRef = useRef(null); // ref để auto-focus ô đếm đầu tiên sau search

    const performCountUpdate = async (itemId, finalCount) => {
        updateItemCountInUI(itemId, finalCount);
        const itemRef = doc(db, 'stocktakes', sessionId, 'items', itemId);
        try {
            await updateDoc(itemRef, { countedQty: finalCount });
            await fetchStatsAndDiscrepancies();
            // Highlight dòng vừa lưu + âm thanh xác nhận
            setJustSavedId(itemId);
            setTimeout(() => setJustSavedId(null), 1000);
            if (finalCount !== null) playBeep();
            return true;
        } catch (error) {
            toast.error("Lỗi: Không thể lưu số lượng.");
            return false;
        }
    };

    const handleResetCount = (itemId) => {
        performCountUpdate(itemId, null);
    };

    const handleCountSubmit = (itemId, value) => {
        const item = useStocktakeStore.getState().items.find(i => i.id === itemId);
        if (!item) return;
        const prevCountedQty = item.countedQtyBeforeSubmit ?? 0;
        const rawValue = String(value).trim();
        if (rawValue === String(item.countedQtyBeforeSubmit ?? '')) return;
        if (rawValue === '') {
            performCountUpdate(itemId, null);
            return;
        }
        let finalCount = NaN;
        if (rawValue.startsWith('+')) {
            const addedValue = evaluateMathExpression(rawValue.substring(1));
            if (!isNaN(addedValue) && addedValue > 0) {
                finalCount = prevCountedQty + addedValue;
            } else {
                toast.warn("Giá trị cộng dồn không hợp lệ.");
            }
        } else {
            finalCount = evaluateMathExpression(rawValue);
        }
        if (isNaN(finalCount) || finalCount < 0) {
            toast.warn("Giá trị nhập không hợp lệ.");
            updateItemCountInUI(itemId, item.countedQtyBeforeSubmit ?? null);
        } else {
            performCountUpdate(itemId, finalCount);
        }
    };

    const fetchStatsAndDiscrepancies = useCallback(async () => {
        if (!sessionId) return;
        const itemsRef = collection(db, 'stocktakes', sessionId, 'items');
        const sessionRef = doc(db, 'stocktakes', sessionId);
        const totalQuery = query(itemsRef, where('isNew', '==', false));
        const countedQuery = query(itemsRef, where('countedQty', '!=', null));
        const [totalSnap, countedSnap, sessionSnap] = await Promise.all([
            getCountFromServer(totalQuery),
            getCountFromServer(countedQuery),
            getDoc(sessionRef)
        ]);
        const sessionStatus = sessionSnap.exists() ? sessionSnap.data().status : 'in_progress';
        let discrepancies = [];
        let discrepancyCount = 0;
        if (sessionStatus === 'completed' || sessionStatus === 'adjusted') {
            const discrepancyDocsSnap = await getDocs(query(itemsRef, where('countedQty', '!=', null)));
            discrepancyDocsSnap.forEach(doc => {
                const data = doc.data();
                if (data.systemQty !== data.countedQty) {
                    discrepancies.push({ id: doc.id, ...data });
                }
            });
            discrepancyCount = discrepancies.length;
        }
        const newSummary = {
            totalItems: totalSnap.data().count,
            countedItems: countedSnap.data().count,
            discrepancies: discrepancyCount
        };
        const sortedDiscrepancies = discrepancies.sort((a, b) => a.productId.localeCompare(b.productId));
        setSummary(newSummary, sortedDiscrepancies);
        // Ghi ngược stats vào document cha để StocktakeListPage hiển thị badge tiến độ
        try {
            await updateDoc(doc(db, 'stocktakes', sessionId), {
                totalItems: newSummary.totalItems,
                countedItems: newSummary.countedItems
            });
        } catch (_) { /* không block nếu lỗi ghi ngược */ }
    }, [sessionId, setSummary]);

    // Realtime listener cập nhật stats khi có người khác đếm cùng phiên
    useEffect(() => {
        if (!sessionId) return;
        const itemsRef = collection(db, 'stocktakes', sessionId, 'items');
        const unsubscribe = onSnapshot(
            query(itemsRef, where('countedQty', '!=', null)),
            (snapshot) => {
                const countedCount = snapshot.size;
                // Chỉ cập nhật countedItems trong summary, không fetch lại toàn bộ
                setSummary(
                    prev => ({ ...prev, countedItems: countedCount }),
                    null
                );
            }
        );
        return () => unsubscribe();
    }, [sessionId, setSummary]);

    // Lưu ghi chú cho từng dòng
    const handleNoteSubmit = async (itemId, note) => {
        const itemRef = doc(db, 'stocktakes', sessionId, 'items', itemId);
        try {
            await updateDoc(itemRef, { countNote: note });
            // Cập nhật UI store
            const { items: currentItems, setItems: storeSetItems } = useStocktakeStore.getState();
            storeSetItems(currentItems.map(i => i.id === itemId ? { ...i, countNote: note } : i));
        } catch (error) {
            toast.error("Lỗi: Không thể lưu ghi chú.");
        }
    };

    useEffect(() => {
        const fetchSessionData = async () => {
            const docRef = doc(db, 'stocktakes', sessionId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                await fetchStatsAndDiscrepancies();
                const storeState = useStocktakeStore.getState();
                initializeSession(
                    { id: docSnap.id, ...docSnap.data() },
                    storeState.summaryStats,
                    storeState.discrepancyItems
                );
            } else {
                toast.error("Không tìm thấy phiên kiểm kê!");
                navigate('/stocktakes');
            }
        };
        fetchSessionData();
        return () => {
            clearStore();
        };
    }, [sessionId, navigate, initializeSession, clearStore, fetchStatsAndDiscrepancies]);

    // Subscribe count_entries realtime khi phiên là collaborative
    useEffect(() => {
        if (!sessionId || !sessionData?.isCollaborative) return;
        const unsubscribe = subscribeToCountEntries(sessionId, (entries) => {
            setCollabEntries(entries);
        });
        return () => unsubscribe();
    }, [sessionId, sessionData?.isCollaborative]);

    // Load danh sách lô hàng lần đầu
    useEffect(() => {
        const fetchInitialItems = async () => {
            if (!sessionId) return;
            setLoadingItems(true);
            try {
                const itemsRef = collection(db, 'stocktakes', sessionId, 'items');
                const q = query(itemsRef, orderBy('productId'), limit(PAGE_SIZE));
                const docSnapshots = await getDocs(q);
                const itemsList = docSnapshots.docs.map(doc => ({
                    id: doc.id, ...doc.data(), countedQtyBeforeSubmit: doc.data().countedQty ?? null
                }));
                setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
                setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
                setItems(itemsList);
            } catch (error) {
                console.error("Lỗi khi tải danh sách kiểm kê ban đầu: ", error);
                toast.error("Lỗi khi tải danh sách kiểm kê.");
            } finally {
                setLoadingItems(false);
            }
        };
        fetchInitialItems();
    }, [sessionId]);

    // Load hệ số quy đổi Misa từ products
    useEffect(() => {
        const loadConvMap = async () => {
            try {
                const prodsSnap = await getDocs(collection(db, 'products'));
                const map = {};
                prodsSnap.forEach(docSnap => {
                    const d = docSnap.data();
                    const f = Number(d.misaConversionFactor);
                    if (f && f !== 1) {
                        map[docSnap.id] = { factor: f, misaUnit: d.misaUnit || '' };
                    }
                });
                setConvMap(map);
            } catch (e) {
                console.error('convMap error:', e);
            }
        };
        loadConvMap();
    }, []);

    // Load cache toàn bộ productId của phiên để gợi ý tìm kiếm
    useEffect(() => {
        if (!sessionId) return;
        const loadProductIdCache = async () => {
            try {
                const snap = await getDocs(
                    query(collection(db, 'stocktakes', sessionId, 'items'), orderBy('productId'))
                );
                const ids = [...new Set(snap.docs.map(d => d.data().productId).filter(Boolean))];
                setProductIdCache(ids);
            } catch (e) {
                console.error('Lỗi load productId cache:', e);
            } finally {
                setIsCacheLoading(false);
            }
        };
        loadProductIdCache();
    }, [sessionId]);

    const handleSearch = async (e) => {
        const term = e.target.value;
        setSearchTerm(term);
        if (e.key !== 'Enter') return;
        setSuggestions([]);
        setLoadingItems(true);
        if (term.trim().length >= 2) {
            const upper = term.trim().toUpperCase().replace(/-/g, '');
            const allItems = useStocktakeStore.getState().items;
            const matched = [...new Set(
                allItems
                    .filter(i => (i.productId || '').replace(/-/g, '').includes(upper))
                    .map(i => i.productId)
            )].slice(0, 8);
            setSuggestions(matched);
        } else {
            setSuggestions([]);
        }
        if (e.key !== 'Enter') return;
        setSuggestions([]);
        setLoadingItems(true);
        try {
            const itemsCollectionRef = collection(db, 'stocktakes', sessionId, 'items');
            let q = query(itemsCollectionRef, orderBy('productId'));
            if (term.trim()) {
                const upperSearchTerm = term.trim().toUpperCase();
                q = query(q, where('productId', '>=', upperSearchTerm), where('productId', '<=', upperSearchTerm + '\uf8ff'));
            }
            const finalQuery = query(q, limit(PAGE_SIZE));
            const docSnapshots = await getDocs(finalQuery);
            const itemsList = docSnapshots.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                countedQtyBeforeSubmit: doc.data().countedQty ?? null
            }));
            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setItems(itemsList);
            setPage(1);
            // Auto-focus ô đếm nếu chỉ có 1 kết quả
            if (itemsList.length === 1) {
                setTimeout(() => firstCountInputRef.current?.focus(), 100);
            }
        } catch (error) {
            console.error("Lỗi khi tìm kiếm vật tư: ", error);
            toast.error("Không thể tìm kiếm danh sách vật tư.");
        } finally {
            setLoadingItems(false);
        }
    };

    const handleSelectSuggestion = (productId) => {
        setSearchTerm(productId);
        setSuggestions([]);
        // Trigger search ngay
        handleSearch({ key: 'Enter', target: { value: productId }, preventDefault: () => {} });
    };

    const handleFinalizeCount = async () => {
        setConfirmModal({ isOpen: false });
        const sessionRef = doc(db, 'stocktakes', sessionId);
        await updateDoc(sessionRef, { status: 'completed' });
        setSessionStatus('completed');
        toast.success("Đã hoàn tất phiên kiểm kê!");
    };

    const promptForFinalize = () => {
        const uncountedItems = summaryStats.totalItems - summaryStats.countedItems;
        let message = "Bạn có chắc chắn muốn hoàn tất và khóa phiên kiểm kê này? Sau khi hoàn tất, bạn có thể xử lý chênh lệch.";
        if (uncountedItems > 0) {
            message = `CẢNH BÁO: Vẫn còn ${uncountedItems} mã hàng chưa được đếm. Nếu bạn hoàn tất, số lượng của chúng sẽ được coi là 0. ` + message;
        }
        setConfirmModal({
            isOpen: true,
            title: "Hoàn tất phiên kiểm kê?",
            message: message,
            onConfirm: handleFinalizeCount,
            confirmText: "Vẫn hoàn tất"
        });
    };

    const handleAddUnlistedItem = async (newItem) => {
        const itemsRef = collection(db, 'stocktakes', sessionId, 'items');
        try {
            const docRef = doc(itemsRef, newItem.lotId);
            await setDoc(docRef, newItem);
            toast.success("Đã thêm mặt hàng mới vào phiên kiểm kê.");
            const q = query(collection(db, 'stocktakes', sessionId, 'items'), orderBy('productId'), limit(PAGE_SIZE));
            const fetchAgain = async () => {
                const docSnapshots = await getDocs(q);
                const itemsList = docSnapshots.docs.map(doc => ({
                    id: doc.id, ...doc.data(), countedQtyBeforeSubmit: doc.data().countedQty ?? null
                }));
                setItems(itemsList);
                setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
                setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
                setPage(1);
            };
            fetchAgain();
            setIsAddItemModalOpen(false);
        } catch (error) {
            toast.error("Có lỗi khi lưu mặt hàng mới, vui lòng thử lại.");
        }
    };

    const handleAdjustInventory = async () => {
        setConfirmModal({ isOpen: false });
        const itemsToAdjust = discrepancyItems.filter(item => checkedItems[item.id]);
        if (itemsToAdjust.length === 0) {
            return toast.warn("Vui lòng chọn mục để điều chỉnh.");
        }
        try {
            const batch = writeBatch(db);
            const adjustmentsCollectionRef = collection(db, 'inventory_adjustments');
            for (const item of itemsToAdjust) {
                const finalCountedQty = item.countedQty ?? 0;
                if (!item.isNew) {
                    const inventoryLotRef = doc(db, 'inventory_lots', item.lotId);
                    batch.update(inventoryLotRef, { quantityRemaining: finalCountedQty });
                } else {
                    const expiryDateObj = parseDateString(item.expiryDate);
                    const expiryTimestamp = expiryDateObj ? Timestamp.fromDate(expiryDateObj) : null;
                    const newInventoryLotRef = doc(collection(db, 'inventory_lots'));
                    const newLotData = {
                        productId: item.productId,
                        productName: item.productName,
                        lotNumber: item.lotNumber,
                        expiryDate: expiryTimestamp,
                        importDate: serverTimestamp(),
                        quantityImported: finalCountedQty,
                        quantityRemaining: finalCountedQty,
                        unit: item.unit,
                        packaging: item.packaging,
                        storageTemp: item.storageTemp,
                        team: item.team,
                        manufacturer: item.manufacturer,
                        supplierName: `Kiểm kê - ${sessionData.name}`,
                        notes: item.notes || `Thêm mới từ phiên kiểm kê ${sessionId}`
                    };
                    batch.set(newInventoryLotRef, newLotData);
                }
                const newAdjustmentRef = doc(adjustmentsCollectionRef);
                batch.set(newAdjustmentRef, {
                    createdAt: serverTimestamp(),
                    stocktakeId: sessionId,
                    productId: item.productId,
                    productName: item.productName,
                    lotNumber: item.lotNumber,
                    quantityBefore: item.systemQty,
                    quantityAfter: finalCountedQty,
                    variance: finalCountedQty - item.systemQty,
                    reason: `Điều chỉnh sau kiểm kê phiên: ${sessionData.name}`
                });
            }
            const sessionRef = doc(db, 'stocktakes', sessionId);
            batch.update(sessionRef, { status: 'adjusted' });
            await batch.commit();
            setSessionStatus('adjusted');
            toast.success("Đã điều chỉnh tồn kho thành công!");
            // Load lại lịch sử sau khi điều chỉnh
            loadAdjustmentHistory();
        } catch (error) {
            toast.error("Đã xảy ra lỗi khi điều chỉnh tồn kho.");
        }
    };

    const loadAdjustmentHistory = async () => {
        try {
            const snap = await getDocs(query(
                collection(db, 'inventory_adjustments'),
                where('stocktakeId', '==', sessionId),
                orderBy('createdAt', 'desc')
            ));
            setAdjustmentHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('Lỗi tải lịch sử điều chỉnh:', e);
        }
    };

    // Load lịch sử điều chỉnh khi phiên đã adjusted
    useEffect(() => {
        if (sessionData?.status === 'adjusted') loadAdjustmentHistory();
    }, [sessionData?.status]);

    const promptForAdjust = () => {
        const itemsToAdjust = discrepancyItems.filter(item => checkedItems[item.id]);
        if (itemsToAdjust.length === 0) return toast.warn("Vui lòng chọn ít nhất một mặt hàng để điều chỉnh.");
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận điều chỉnh tồn kho?",
            message: `Bạn có chắc muốn điều chỉnh tồn kho cho ${itemsToAdjust.length} mặt hàng đã chọn không? Thao tác này không thể hoàn tác.`,
            onConfirm: handleAdjustInventory,
            confirmText: "Đồng ý điều chỉnh"
        });
    };

    // --- COLLABORATIVE HELPERS ---
    const collabConflicts = collabEntries.filter(e => e.conflict === true && e.rejected !== true);
    const hasUnresolvedConflicts = collabConflicts.length > 0;

    // Tính progress từ count_entries cho phiên collaborative
    const collabCountedLots = new Set(collabEntries.filter(e => !e.rejected).map(e => e.lotId)).size;
    const collabProgressPercent = summaryStats.totalItems > 0
        ? Math.round((collabCountedLots / summaryStats.totalItems) * 100)
        : 0;

    // Nhóm entries theo người nhập
    const entriesByParticipant = collabEntries.reduce((acc, entry) => {
        if (entry.rejected) return acc;
        const key = entry.enteredBy;
        if (!acc[key]) acc[key] = { email: entry.enteredByEmail || entry.enteredBy, count: 0 };
        acc[key].count++;
        return acc;
    }, {});

    // Nhóm conflicts theo lotId để hiển thị trong modal
    const conflictsByLot = collabConflicts.reduce((acc, entry) => {
        if (!acc[entry.lotId]) acc[entry.lotId] = { lotId: entry.lotId, productId: entry.productId, productName: entry.productName, lotNumber: entry.lotNumber, entries: [] };
        acc[entry.lotId].entries.push(entry);
        return acc;
    }, {});

    const handleCollabReconcile = async () => {
        setConfirmModal({ isOpen: false });
        try {
            const result = await reconcileSession(sessionId, user.uid);
            setSessionStatus('adjusted');
            toast.success(`Đã áp dụng kết quả kiểm kê! ${result.discrepancyCount} lô có chênh lệch được điều chỉnh.`);
            loadAdjustmentHistory();
        } catch (err) {
            toast.error(err.message || 'Lỗi khi áp dụng kết quả');
        }
    };

    const promptForCollabReconcile = () => {
        if (hasUnresolvedConflicts) {
            toast.warn(`Còn ${collabConflicts.length} xung đột chưa giải quyết. Vui lòng giải quyết trước khi áp dụng.`);
            return;
        }
        setConfirmModal({
            isOpen: true,
            title: "Áp dụng kết quả kiểm kê cộng tác?",
            message: `Đã có ${collabCountedLots} lô được kiểm kê. Xác nhận sẽ cập nhật tồn kho theo số liệu đã đếm. Thao tác này không thể hoàn tác.`,
            onConfirm: handleCollabReconcile,
            confirmText: "Xác nhận áp dụng"
        });
    };

    if (loading) return <Spinner />;
    if (!sessionData) return <div>Không tìm thấy dữ liệu cho phiên kiểm kê này.</div>;

    const isSessionInProgress = sessionData.status === 'in_progress' || sessionData.status === 'active';

    // Lọc items theo filterMode
    const filteredItems = items.filter(item => {
        if (filterMode === 'uncounted') return item.countedQty === null || item.countedQty === undefined || item.countedQty === '';
        if (filterMode === 'counted') return item.countedQty !== null && item.countedQty !== undefined && item.countedQty !== '';
        return true;
    });

    // Tính % tiến độ
    const progressPercent = summaryStats.totalItems > 0
        ? Math.round((summaryStats.countedItems / summaryStats.totalItems) * 100)
        : 0;

    const handleNextPage = async () => {
        if (isLastPage) return;
        setLoadingItems(true);
        try {
            const itemsCollectionRef = collection(db, 'stocktakes', sessionId, 'items');
            let q = query(itemsCollectionRef, orderBy('productId'));
            if (searchTerm) {
                const upperSearchTerm = searchTerm.toUpperCase();
                q = query(q, where('productId', '>=', upperSearchTerm), where('productId', '<=', upperSearchTerm + '\uf8ff'));
            }
            const nextPageQuery = query(q, startAfter(lastVisible), limit(PAGE_SIZE));
            const docSnapshots = await getDocs(nextPageQuery);
            const itemsList = docSnapshots.docs.map(doc => ({
                id: doc.id, ...doc.data(), countedQtyBeforeSubmit: doc.data().countedQty ?? null
            }));
            setCursorHistory(prev => [...prev, lastVisible]);
            setItems(itemsList);
            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setPage(p => p + 1);
            tableContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            toast.error("Lỗi khi tải trang tiếp theo.");
        } finally {
            setLoadingItems(false);
        }
    };

    const handlePrevPage = async () => {
        if (page <= 1) return;
        setLoadingItems(true);
        try {
            const itemsCollectionRef = collection(db, 'stocktakes', sessionId, 'items');
            let q = query(itemsCollectionRef, orderBy('productId'));
            if (searchTerm) {
                const upperSearchTerm = searchTerm.toUpperCase();
                q = query(q, where('productId', '>=', upperSearchTerm), where('productId', '<=', upperSearchTerm + '\uf8ff'));
            }
            const newHistory = [...cursorHistory];
            const prevCursor = newHistory.pop();
            setCursorHistory(newHistory);
            const prevPageQuery = prevCursor
                ? query(q, startAfter(prevCursor), limit(PAGE_SIZE))
                : query(q, limit(PAGE_SIZE));
            const docSnapshots = await getDocs(prevPageQuery);
            const itemsList = docSnapshots.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                countedQtyBeforeSubmit: doc.data().countedQty ?? null
            }));
            setItems(itemsList);
            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(false);
            setPage(p => p - 1);
            tableContainerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch (error) {
            toast.error("Lỗi khi tải trang trước.");
        } finally {
            setLoadingItems(false);
        }
    };

    const handleExportPDF = async () => {
        const session = useStocktakeStore.getState().sessionData;
        if (!session) {
            toast.warn("Chưa có dữ liệu phiên để xuất file PDF.");
            return;
        }
        toast.info("Đang tải toàn bộ dữ liệu để tạo file PDF...");
        try {
            const itemsRef = collection(db, 'stocktakes', sessionId, 'items');
            const q = query(itemsRef, orderBy('productId'));
            const querySnapshot = await getDocs(q);
            const allItems = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (allItems.length === 0) {
                toast.warn("Phiên kiểm kê này không có sản phẩm nào để xuất ra file.");
                return;
            }
            const { exportStocktakeToPDF } = await import('../utils/pdfUtils');
            await exportStocktakeToPDF(session, allItems);
        } catch (error) {
            console.error("Lỗi khi xuất PDF phiếu kiểm kê:", error);
            toast.error("Đã xảy ra lỗi khi tạo file PDF.");
        }
    };

    return (
        <div className="stocktake-session-page-container">
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={confirmModal.onCancel ?? (() => setConfirmModal({ isOpen: false }))}
                confirmText={confirmModal.confirmText}
                cancelText={confirmModal.cancelText}
            />
            {isAddItemModalOpen && (
                <AddUnlistedItemModal
                    onClose={() => setIsAddItemModalOpen(false)}
                    onAddItem={handleAddUnlistedItem}
                />
            )}
            {conflictModal.isOpen && conflictModal.conflict && (
                <ConflictResolutionModal
                    sessionId={sessionId}
                    conflict={conflictModal.conflict}
                    onResolve={() => setConflictModal({ isOpen: false, conflict: null })}
                    onClose={() => setConflictModal({ isOpen: false, conflict: null })}
                />
            )}

            <div className="page-header">
                <h1>{sessionData.name} <StatusBadge status={sessionData.status} /></h1>
                <div className="header-actions">
                    <button onClick={handleExportPDF} className="btn-secondary">
                        <FiPrinter style={{ marginRight: '5px' }} />
                        Xuất PDF Kiểm kê
                    </button>
                    {isSessionInProgress && (
                        <button onClick={promptForFinalize} className="btn-primary">
                            Hoàn tất đếm
                        </button>
                    )}
                </div>
            </div>

            {/* Stats luôn hiển thị + Progress bar */}
            <div className="form-section">
                <div className="compact-info-grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
                    <div><label>Tổng số mã cần đếm</label><p><strong>{summaryStats.totalItems}</strong></p></div>
                    <div><label>Số mã đã đếm</label><p style={{ color: 'green' }}><strong>{summaryStats.countedItems}</strong></p></div>
                    <div><label>{sessionData.status === 'in_progress' ? 'Chưa đếm' : 'Số mã có chênh lệch'}</label>
                        <p style={{ color: 'red' }}><strong>
                            {sessionData.status === 'in_progress'
                                ? (summaryStats.totalItems - summaryStats.countedItems)
                                : summaryStats.discrepancies}
                        </strong></p>
                    </div>
                </div>
                <div className="progress-bar-container">
                    <div className="progress-bar-track">
                        <div
                            className="progress-bar-fill"
                            style={{
                                width: `${progressPercent}%`,
                                backgroundColor: progressPercent >= 80 ? '#28a745' : progressPercent >= 50 ? '#ffc107' : '#dc3545'
                            }}
                        />
                    </div>
                    <span className="progress-bar-label">{progressPercent}% hoàn thành</span>
                </div>
            </div>

            {/* === COLLABORATIVE DASHBOARD === */}
            {sessionData.isCollaborative && (
                <>
                    {/* Panel người tham gia + tiến độ cộng tác */}
                    <div className="form-section" style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: 600, fontSize: '15px' }}>
                            <FiUsers style={{ color: '#007bff' }} /> Kiểm kê cộng tác
                        </div>
                        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '10px' }}>
                            {(sessionData.participantEmails || []).map(email => {
                                const uid = (sessionData.participantUids || [])[
                                    (sessionData.participantEmails || []).indexOf(email)
                                ];
                                const info = entriesByParticipant[uid];
                                return (
                                    <div key={email} style={{ background: '#f8f9fa', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', border: '1px solid #e9ecef' }}>
                                        <div style={{ fontWeight: 600, color: '#333' }}>{email}</div>
                                        <div style={{ color: '#888', marginTop: '2px' }}>
                                            {info ? `${info.count} lô đã nhập` : 'Chưa nhập'}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ flex: 1, height: '8px', background: '#e9ecef', borderRadius: '4px', overflow: 'hidden' }}>
                                <div style={{ height: '100%', borderRadius: '4px', width: `${collabProgressPercent}%`, background: collabProgressPercent >= 80 ? '#28a745' : collabProgressPercent >= 50 ? '#ffc107' : '#007bff', transition: 'width 0.3s' }} />
                            </div>
                            <span style={{ fontSize: '13px', color: '#555', whiteSpace: 'nowrap' }}>
                                {collabCountedLots}/{summaryStats.totalItems} lô ({collabProgressPercent}%)
                            </span>
                        </div>
                        {sessionData.status === 'active' && (
                            <button
                                onClick={promptForCollabReconcile}
                                disabled={hasUnresolvedConflicts}
                                className="btn-primary"
                                style={{ marginTop: '12px', opacity: hasUnresolvedConflicts ? 0.5 : 1 }}
                                title={hasUnresolvedConflicts ? `Còn ${collabConflicts.length} xung đột chưa giải quyết` : ''}
                            >
                                Áp dụng kết quả kiểm kê
                            </button>
                        )}
                    </div>

                    {/* Panel xung đột */}
                    {collabConflicts.length > 0 && (
                        <div className="form-section" style={{ marginBottom: '16px', border: '1px solid #ffc107', background: '#fffdf0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', fontWeight: 600, fontSize: '15px', color: '#856404' }}>
                                <FiAlertTriangle /> {collabConflicts.length} xung đột cần giải quyết
                            </div>
                            {Object.values(conflictsByLot).map(conflict => (
                                conflict.entries.length >= 2 && (
                                    <div key={conflict.lotId} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f0e68c' }}>
                                        <div>
                                            <div style={{ fontWeight: 600, fontSize: '13px' }}>{conflict.productId}</div>
                                            <div style={{ fontSize: '12px', color: '#888' }}>Lô: {conflict.lotNumber || 'N/A'} — {conflict.entries.length} người nhập khác nhau</div>
                                        </div>
                                        <button
                                            onClick={() => setConflictModal({ isOpen: true, conflict })}
                                            className="btn-secondary"
                                            style={{ padding: '5px 12px', fontSize: '13px' }}
                                        >
                                            Giải quyết
                                        </button>
                                    </div>
                                )
                            ))}
                        </div>
                    )}
                </>
            )}

            <div className="controls-container">
                <div className="search-container" style={{ position: 'relative' }}>
                    <input
                        type="text"
                        placeholder={isCacheLoading ? "Đang tải danh sách mã hàng..." : "Tìm Mã hàng rồi nhấn Enter..."}
                        value={searchTerm}
                        onChange={(e) => {
                            const val = e.target.value;
                            setSearchTerm(val);
                            // Gợi ý realtime dựa trên giá trị mới nhất
                            if (val.trim().length >= 2) {
                                const upper = val.trim().toUpperCase().replace(/-/g, '');
                                const startsWith = productIdCache.filter(pid => pid.replace(/-/g, '').startsWith(upper));
                                const contains = productIdCache.filter(pid => {
                                    const clean = pid.replace(/-/g, '');
                                    return !clean.startsWith(upper) && clean.includes(upper);
                                });
                                setSuggestions([...startsWith, ...contains].slice(0, 8));
                            } else {
                                setSuggestions([]);
                            }
                        }}
                        onKeyDown={handleSearch}
                        onBlur={() => setTimeout(() => setSuggestions([]), 150)}
                        className="search-input"
                    />
                    {suggestions.length > 0 && (
                        <ul className="search-suggestions">
                            {suggestions.map(pid => {
                                // Highlight phần khớp với từ khóa
                                const upper = searchTerm.trim().toUpperCase();
                                const cleanPid = pid; // giữ nguyên dấu - để hiển thị
                                const cleanUpper = upper.replace(/-/g, '');
                                const cleanPidNoDash = pid.replace(/-/g, '');
                                const matchIdx = cleanPidNoDash.indexOf(cleanUpper);
                                if (matchIdx === -1) return <li key={pid} onMouseDown={() => handleSelectSuggestion(pid)}>{pid}</li>;
                                // Map vị trí trong chuỗi không dấu về chuỗi gốc có dấu -
                                let charCount = 0;
                                let startOrig = -1, endOrig = -1;
                                for (let i = 0; i < pid.length; i++) {
                                    if (pid[i] !== '-') {
                                        if (charCount === matchIdx) startOrig = i;
                                        if (charCount === matchIdx + cleanUpper.length - 1) { endOrig = i + 1; break; }
                                        charCount++;
                                    }
                                }
                                if (startOrig === -1) return <li key={pid} onMouseDown={() => handleSelectSuggestion(pid)}>{pid}</li>;
                                return (
                                    <li key={pid} onMouseDown={() => handleSelectSuggestion(pid)}>
                                        {pid.slice(0, startOrig)}
                                        <mark style={{ backgroundColor: '#ffeb3b', color: '#000', padding: '0 1px', borderRadius: '2px' }}>
                                            {pid.slice(startOrig, endOrig)}
                                        </mark>
                                        {pid.slice(endOrig)}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
                <div className="filter-tabs">
                    <button className={`filter-tab ${filterMode === 'all' ? 'active' : ''}`} onClick={() => setFilterMode('all')}>Tất cả</button>
                    <button className={`filter-tab ${filterMode === 'uncounted' ? 'active' : ''}`} onClick={() => setFilterMode('uncounted')}>Chưa đếm</button>
                    <button className={`filter-tab ${filterMode === 'counted' ? 'active' : ''}`} onClick={() => setFilterMode('counted')}>Đã đếm</button>
                </div>
                {isSessionInProgress && (
                    <button
                        onClick={() => setIsAddItemModalOpen(true)}
                        className="btn-secondary"
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        + Thêm Hàng Ngoài DS
                    </button>
                )}
            </div>

            {loadingItems ? <Spinner /> : (
                <>
                    <div className="table-container" ref={tableContainerRef}>
                        <table className="products-table sticky-header-table">
                            <thead>
                                <tr>
                                    <th>Mã hàng</th>
                                    <th>Tên hàng</th>
                                    <th>Số lô</th>
                                    <th>HSD</th>
                                    <th>ĐVT</th>
                                    <th>Quy cách</th>
                                    <th>Tồn hệ thống</th>
                                    <th>Tồn Misa (quy đổi)</th>
                                    <th>Tồn thực tế</th>
                                    <th>Ghi chú</th>
                                    <th>Nhóm hàng</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.length > 0 ? filteredItems.map((item, index) => {
                                        // Tô màu dòng chênh lệch: đã đếm và khác systemQty
                                        const hasCounted = item.countedQty !== null && item.countedQty !== undefined && item.countedQty !== '';
                                        const hasDiscrepancy = hasCounted && Number(item.countedQty) !== Number(item.systemQty);
                                        const expiryColorClass = getRowColorByExpiry(item.expiryDate, item.subGroup);
                                        const rowClass = [
                                            expiryColorClass,
                                            hasDiscrepancy ? 'row-discrepancy' : '',
                                            justSavedId === item.id ? 'row-just-saved' : ''
                                        ].filter(Boolean).join(' ');
                                        return (
                                    <tr key={item.id} className={rowClass}>
                                        <td>{item.productId}</td>
                                        <td>{item.productName}</td>
                                        <td>{item.lotNumber || '(Không có)'}</td>
                                        <td>{item.expiryDate ? formatDate(item.expiryDate) : '(Không có)'}</td>
                                        <td>{item.unit}</td>
                                        <td>{item.packaging}</td>
                                        <td>{item.systemQty}</td>
                                        <td style={{
                                            color: convMap[item.productId] ? '#1a73e8' : 'inherit',
                                            fontWeight: convMap[item.productId] ? '600' : 'normal'
                                        }}>
                                            {convMap[item.productId]
                                                ? <>
                                                    {(item.systemQty * convMap[item.productId].factor).toLocaleString('vi-VN')}
                                                    {convMap[item.productId].misaUnit && (
                                                        <span style={{ fontSize: '11px', marginLeft: '3px', color: '#888' }}>
                                                            {convMap[item.productId].misaUnit}
                                                        </span>
                                                    )}
                                                </>
                                                : <span style={{ color: '#bbb', fontSize: '12px' }}>—</span>
                                            }
                                        </td>
                                        <td>
                                            <CountInput item={item} onCountSubmit={handleCountSubmit} onResetCount={handleResetCount} inputRef={index === 0 ? firstCountInputRef : null} />
                                        </td>
                                        <td>
                                            <NoteInput item={item} onNoteSubmit={handleNoteSubmit} />
                                        </td>
                                        <td>{item.subGroup}</td>
                                    </tr>
                                        );
                                    }) : (
                                    <tr>
                                        <td colSpan="11" style={{ textAlign: 'center', color: '#888', padding: '20px' }}>
                                            {filterMode === 'uncounted' ? 'Tất cả mã hàng đã được đếm.' : 'Chưa có mã hàng nào được đếm.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {!searchTerm && (
                        <div className="pagination-controls">
                            <button onClick={handlePrevPage} disabled={page <= 1 || loadingItems}>
                                <FiChevronLeft /> Trang Trước
                            </button>
                            <span>Trang {page}</span>
                            <button onClick={handleNextPage} disabled={isLastPage || loadingItems}>
                                Trang Tiếp <FiChevronRight />
                            </button>
                        </div>
                    )}
                </>
            )}

            {(sessionData.status === 'completed' || sessionData.status === 'adjusted') && (
                <div className="form-section" style={{ marginTop: '20px' }}>
                    <h3 style={{ color: '#dc3545' }}>Xử lý Chênh lệch</h3>
                    {discrepancyItems.length > 0 ? (
                        <>
                            <table className="products-table discrepancy-table">
                                <thead>
                                    <tr>
                                        <th>
                                            <input
                                                type="checkbox"
                                                onChange={(e) => toggleAllCheckedItems(e.target.checked)}
                                                disabled={sessionData.status === 'adjusted'}
                                            />
                                        </th>
                                        <th>Mã hàng</th>
                                        <th>Tên hàng</th>
                                        <th>Số lô</th>
                                        <th>Tồn hệ thống</th>
                                        <th>Tồn thực tế</th>
                                        <th>Chênh lệch</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {discrepancyItems.map(item => (
                                        <tr key={item.id}>
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    checked={!!checkedItems[item.id]}
                                                    onChange={() => toggleCheckedItem(item.id)}
                                                    disabled={sessionData.status === 'adjusted'}
                                                />
                                            </td>
                                            <td>{item.productId}</td>
                                            <td>{item.productName}</td>
                                            <td>{item.lotNumber}</td>
                                            <td>{item.systemQty}</td>
                                            <td><strong>{item.countedQty ?? 0}</strong></td>
                                            <td style={{
                                                color: (item.countedQty ?? 0) > item.systemQty ? 'green' : 'red',
                                                fontWeight: 'bold'
                                            }}>
                                                {(item.countedQty ?? 0) - item.systemQty}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {sessionData.status !== 'adjusted' && (
                                <div className="page-actions">
                                    <button onClick={promptForAdjust} className="btn-primary">
                                        Xác Nhận Điều Chỉnh Tồn Kho
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <p>Không có chênh lệch nào được ghi nhận.</p>
                    )}
                </div>
            )}

            {/* LỊCH SỬ ĐIỀU CHỈNH */}
            {sessionData.status === 'adjusted' && adjustmentHistory.length > 0 && (
                <div className="form-section" style={{ marginTop: '20px' }}>
                    <h3 style={{ color: '#495057' }}>Lịch sử Điều chỉnh Tồn kho</h3>
                    <table className="products-table">
                        <thead>
                            <tr>
                                <th>Thời gian</th>
                                <th>Mã hàng</th>
                                <th>Tên hàng</th>
                                <th>Số lô</th>
                                <th>Tồn trước</th>
                                <th>Tồn sau</th>
                                <th>Chênh lệch</th>
                            </tr>
                        </thead>
                        <tbody>
                            {adjustmentHistory.map(adj => (
                                <tr key={adj.id}>
                                    <td style={{ fontSize: '12px', color: '#888' }}>
                                        {adj.createdAt?.toDate().toLocaleString('vi-VN')}
                                    </td>
                                    <td>{adj.productId}</td>
                                    <td>{adj.productName}</td>
                                    <td>{adj.lotNumber || '(Không có)'}</td>
                                    <td>{adj.quantityBefore}</td>
                                    <td><strong>{adj.quantityAfter}</strong></td>
                                    <td style={{
                                        fontWeight: 'bold',
                                        color: adj.variance > 0 ? '#28a745' : '#dc3545'
                                    }}>
                                        {adj.variance > 0 ? `+${adj.variance}` : adj.variance}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export default StocktakeSessionPage;