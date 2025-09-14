// src/pages/StocktakeSessionPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { doc, getDoc, updateDoc, writeBatch, collection, addDoc, serverTimestamp, query, orderBy, limit, startAfter, getDocs, where, getCountFromServer, setDoc } from 'firebase/firestore';
import '../styles/StocktakePage.css';
import AddUnlistedItemModal from '../components/AddUnlistedItemModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

const PAGE_SIZE = 50;

const StocktakeSessionPage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const [loadingSession, setLoadingSession] = useState(true);
    const [loadingItems, setLoadingItems] = useState(true);
    const [sessionData, setSessionData] = useState(null);
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [discrepancyItems, setDiscrepancyItems] = useState([]);
    const [checkedItems, setCheckedItems] = useState({});
    const [summaryStats, setSummaryStats] = useState({ totalItems: 0, countedItems: 0, discrepancies: 0 });
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    const [isLastPage, setIsLastPage] = useState(false);
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });

    const fetchSessionData = useCallback(async () => {
        setLoadingSession(true);
        const docRef = doc(db, 'stocktakes', sessionId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
            setSessionData({ id: docSnap.id, ...docSnap.data() });
        } else {
            toast.error("Không tìm thấy phiên kiểm kê!");
            navigate('/stocktakes');
        }
        setLoadingSession(false);
    }, [sessionId, navigate]);

    const buildItemsQuery = useCallback(() => {
        const itemsCollectionRef = collection(db, 'stocktakes', sessionId, 'items');
        let q = query(itemsCollectionRef, orderBy('productId'));
        if (searchTerm) {
            const upperSearchTerm = searchTerm.toUpperCase();
            q = query(q, where('productId', '>=', upperSearchTerm), where('productId', '<=', upperSearchTerm + '\uf8ff'));
        }
        return q;
    }, [sessionId, searchTerm]);

    const fetchFirstPage = useCallback(async () => {
        if (!sessionId) return;
        setLoadingItems(true);
        try {
            const q = buildItemsQuery();
            const firstPageQuery = query(q, limit(PAGE_SIZE));
            const docSnapshots = await getDocs(firstPageQuery);
            const itemsList = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setItems(itemsList);
            setPage(1);
        } catch (error) {
            console.error("Lỗi khi tải vật tư kiểm kê: ", error);
            toast.error("Không thể tải danh sách vật tư. Vui lòng kiểm tra Console (F12) để tạo Index nếu được yêu cầu.");
        } finally {
            setLoadingItems(false);
        }
    }, [sessionId, buildItemsQuery]);

    const fetchNextPage = async () => {
        if (!sessionId || !lastVisible) return;
        setLoadingItems(true);
        try {
            const q = buildItemsQuery();
            const nextPageQuery = query(q, startAfter(lastVisible), limit(PAGE_SIZE));
            const docSnapshots = await getDocs(nextPageQuery);
            const itemsList = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setItems(itemsList);
            setPage(p => p + 1);
        } catch (error) {
            console.error("Lỗi khi tải vật tư kiểm kê: ", error);
        } finally {
            setLoadingItems(false);
        }
    };
    
    const fetchStatsAndDiscrepancies = useCallback(async () => {
        if (!sessionId || !sessionData) return;
        const itemsRef = collection(db, 'stocktakes', sessionId, 'items');
        const totalQuery = query(itemsRef, where('isNew', '==', false));
        const countedQuery = query(itemsRef, where('countedQty', '!=', null));
        
        const [totalSnap, countedDocsSnap] = await Promise.all([
            getCountFromServer(totalQuery),
            getDocs(countedQuery)
        ]);
        
        const discrepancies = [];
        countedDocsSnap.forEach(doc => {
            const data = doc.data();
            if (data.systemQty !== data.countedQty) {
                discrepancies.push({ id: doc.id, ...data });
            }
        });

        setSummaryStats({
            totalItems: totalSnap.data().count,
            countedItems: countedDocsSnap.size,
            discrepancies: discrepancies.length
        });
        setDiscrepancyItems(discrepancies.sort((a, b) => a.productId.localeCompare(b.productId)));
    }, [sessionId, sessionData]);

    useEffect(() => { fetchSessionData(); }, [fetchSessionData]);
    
    useEffect(() => {
        const debounce = setTimeout(() => {
            fetchFirstPage();
        }, 500);
        return () => clearTimeout(debounce);
    }, [searchTerm, fetchFirstPage]);

    useEffect(() => {
        if (sessionData?.status === 'completed' || sessionData?.status === 'adjusted') {
            fetchStatsAndDiscrepancies();
        }
    }, [sessionData, fetchStatsAndDiscrepancies]);

    const performCountUpdate = async (itemId, finalCount) => {
        const itemRef = doc(db, 'stocktakes', sessionId, 'items', itemId);
        try {
            await updateDoc(itemRef, { countedQty: finalCount });
            setItems(currentItems => 
                currentItems.map(item => item.id === itemId ? { ...item, countedQty: finalCount } : item)
            );
        } catch (error) {
            toast.error("Lỗi: Không thể lưu số lượng.");
        } finally {
            setConfirmModal({isOpen: false});
        }
    };
    
    const handleCountChange = (itemId, countedQty, newCountValue) => {
        const newCount = newCountValue === '' ? null : Number(newCountValue);
        if ((countedQty || 0) > 0 && newCount !== null) {
            const cumulativeTotal = (countedQty || 0) + newCount;
            setConfirmModal({
                isOpen: true,
                title: "Cộng Dồn hay Ghi Đè?",
                message: `Đã đếm ${countedQty}. Bạn muốn cộng dồn thêm ${newCount} (tổng: ${cumulativeTotal}) hay ghi đè bằng giá trị mới là ${newCount}?`,
                onConfirm: () => performCountUpdate(itemId, cumulativeTotal),
                onCancel: () => performCountUpdate(itemId, newCount),
                confirmText: "Cộng Dồn",
                cancelText: "Ghi Đè"
            });
        } else {
            performCountUpdate(itemId, newCount);
        }
    };

    const handleFinalizeCount = async () => {
        setConfirmModal({isOpen: false});
        try {
            const sessionRef = doc(db, 'stocktakes', sessionId);
            await updateDoc(sessionRef, { status: 'completed' });
            toast.success("Đã hoàn tất phiên kiểm kê!");
            fetchSessionData();
        } catch (error) {
            toast.error("Đã có lỗi xảy ra khi hoàn tất.");
        }
    };

    const promptForFinalize = () => {
        setConfirmModal({
            isOpen: true,
            title: "Hoàn tất phiên kiểm kê?",
            message: "Bạn có chắc chắn muốn hoàn tất và khóa phiên kiểm kê này? Sau khi hoàn tất, bạn có thể xử lý chênh lệch.",
            onConfirm: handleFinalizeCount,
            confirmText: "Hoàn tất"
        });
    };

    const handleAddUnlistedItem = async (newItem) => {
        const itemsRef = collection(db, 'stocktakes', sessionId, 'items');
        try {
            const docRef = doc(itemsRef, newItem.lotId);
            await setDoc(docRef, newItem);
            toast.success("Đã thêm mặt hàng mới vào phiên kiểm kê.");
            fetchFirstPage();
            setIsAddItemModalOpen(false);
        } catch (error) {
            toast.error("Có lỗi khi lưu mặt hàng mới, vui lòng thử lại.");
        }
    };

    const handleAdjustInventory = async () => {
        setConfirmModal({isOpen: false});
        const itemsToAdjust = discrepancyItems.filter(item => checkedItems[item.id]);
        if (itemsToAdjust.length === 0) {
            toast.warn("Vui lòng chọn mục để điều chỉnh.");
            return;
        }
        try {
            const batch = writeBatch(db);
            const adjustmentsCollectionRef = collection(db, 'inventory_adjustments');
            for (const item of itemsToAdjust) {
                if (!item.isNew) {
                    const inventoryLotRef = doc(db, 'inventory_lots', item.lotId);
                    batch.update(inventoryLotRef, { quantityRemaining: item.countedQty });
                }
                const newAdjustmentRef = doc(adjustmentsCollectionRef);
                batch.set(newAdjustmentRef, {
                    createdAt: serverTimestamp(), stocktakeId: sessionId, productId: item.productId,
                    productName: item.productName, lotNumber: item.lotNumber, quantityBefore: item.systemQty,
                    quantityAfter: item.countedQty, variance: item.countedQty - item.systemQty,
                    reason: `Điều chỉnh sau kiểm kê phiên: ${sessionData.name}`
                });
            }
            const sessionRef = doc(db, 'stocktakes', sessionId);
            batch.update(sessionRef, { status: 'adjusted' });
            await batch.commit();
            toast.success("Đã điều chỉnh tồn kho thành công!");
            fetchSessionData();
        } catch (error) {
            toast.error("Đã xảy ra lỗi khi điều chỉnh tồn kho.");
        }
    };

    const promptForAdjust = () => {
        const itemsToAdjust = discrepancyItems.filter(item => checkedItems[item.id]);
        if (itemsToAdjust.length === 0) {
            toast.warn("Vui lòng chọn ít nhất một mặt hàng để điều chỉnh.");
            return;
        }
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận điều chỉnh tồn kho?",
            message: `Bạn có chắc muốn điều chỉnh tồn kho cho ${itemsToAdjust.length} mặt hàng đã chọn không? Thao tác này không thể hoàn tác.`,
            onConfirm: handleAdjustInventory,
            confirmText: "Đồng ý điều chỉnh"
        });
    };
    
    const handleCheckboxChange = (itemId) => { setCheckedItems(prev => ({ ...prev, [itemId]: !prev[itemId] })); };

    if (loadingSession) return <Spinner />;
    if (!sessionData) return <div>Không tìm thấy dữ liệu cho phiên kiểm kê này.</div>;

    const isSessionInProgress = sessionData.status === 'in_progress';

    const CountInput = ({ item }) => {
        const [currentValue, setCurrentValue] = useState(item.countedQty ?? '');
        const handleKeyDown = (e) => { if (e.key === 'Enter') e.target.blur(); };
        useEffect(() => { setCurrentValue(item.countedQty ?? ''); }, [item.countedQty]);
        return (
            <input type="number" placeholder="Nhập số đếm" value={currentValue}
                onChange={e => setCurrentValue(e.target.value)}
                onBlur={() => handleCountChange(item.id, item.countedQty, currentValue)}
                onKeyDown={handleKeyDown} disabled={!isSessionInProgress}
                style={{ backgroundColor: item.isNew ? '#fff9e6' : ((item.countedQty !== null && item.countedQty !== '') ? '#e6fffa' : '#fff') }}
            />
        );
    };

    return (
        <div className="stocktake-session-page-container">
            <ConfirmationModal isOpen={confirmModal.isOpen} {...confirmModal} onCancel={() => setConfirmModal({ isOpen: false })} />
            {isAddItemModalOpen && (<AddUnlistedItemModal onClose={() => setIsAddItemModalOpen(false)} onAddItem={handleAddUnlistedItem} />)}

            <div className="page-header">
                <h1>{sessionData.name} <StatusBadge status={sessionData.status} /></h1>
                <div>
                    {isSessionInProgress && (<button onClick={promptForFinalize} className="btn-primary">Hoàn tất đếm</button>)}
                </div>
            </div>

            {(sessionData.status === 'completed' || sessionData.status === 'adjusted') && (
                 <div className="form-section">
                    <div className="compact-info-grid" style={{gridTemplateColumns: '1fr 1fr 1fr'}}>
                        <div><label>Tổng số mã cần đếm</label><p><strong>{summaryStats.totalItems}</strong></p></div>
                        <div><label>Số mã đã đếm</label><p style={{color: 'green'}}><strong>{summaryStats.countedItems}</strong></p></div>
                        <div><label>Số mã có chênh lệch</label><p style={{color: 'red'}}><strong>{summaryStats.discrepancies}</strong></p></div>
                    </div>
                </div>
            )}

            <div className="controls-container">
                <div className="search-container">
                    <input type="text" placeholder="Tìm theo Mã hàng..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="search-input" />
                </div>
                {isSessionInProgress && (
                    <button onClick={() => setIsAddItemModalOpen(true)} className="btn-secondary" style={{whiteSpace: 'nowrap'}}>+ Thêm Hàng Ngoài DS</button>
                )}
            </div>

            {loadingItems ? <Spinner /> : (
                <>
                    <div className="table-container">
                        <table className="products-table">
                            <thead>
                                <tr>
                                    <th>Mã hàng</th><th>Tên hàng</th><th>Số lô</th>
                                    <th>HSD</th><th>Tồn hệ thống</th><th>Tồn thực tế</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item) => (
                                    <tr key={item.id}>
                                        <td>{item.productId}</td><td>{item.productName}</td><td>{item.lotNumber}</td>
                                        <td>{formatDate(item.expiryDate)}</td><td>{item.systemQty}</td>
                                        <td><CountInput item={item} /></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!searchTerm && (
                        <div className="pagination-controls">
                            <button onClick={fetchFirstPage} disabled={page <= 1}>
                                <FiChevronLeft /> Trang Trước
                            </button>
                            <span>Trang {page}</span>
                            <button onClick={fetchNextPage} disabled={isLastPage}>
                                Trang Tiếp <FiChevronRight />
                            </button>
                        </div>
                    )}
                </>
            )}

            {(sessionData.status === 'completed' || sessionData.status === 'adjusted') && (
                <div className="form-section" style={{marginTop: '20px'}}>
                    <h3 style={{color: '#dc3545'}}>Xử Lý Chênh Lệch</h3>
                    {discrepancyItems.length > 0 ? (
                        <>
                            <table className="products-table">
                                <thead>
                                    <tr>
                                        <th><input type="checkbox" onChange={(e) => setCheckedItems(e.target.checked ? Object.fromEntries(discrepancyItems.map(i => [i.id, true])) : {})} disabled={sessionData.status === 'adjusted'} /></th>
                                        <th>Mã hàng</th><th>Tên hàng</th><th>Số lô</th>
                                        <th>Tồn hệ thống</th><th>Tồn thực tế</th><th>Chênh lệch</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {discrepancyItems.map(item => (
                                        <tr key={item.id}>
                                            <td><input type="checkbox" checked={!!checkedItems[item.id]} onChange={() => handleCheckboxChange(item.id)} disabled={sessionData.status === 'adjusted'} /></td>
                                            <td>{item.productId}</td><td>{item.productName}</td><td>{item.lotNumber}</td>
                                            <td>{item.systemQty}</td><td><strong>{item.countedQty}</strong></td>
                                            <td style={{color: item.countedQty > item.systemQty ? 'green' : 'red', fontWeight: 'bold'}}>{item.countedQty - item.systemQty}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {sessionData.status !== 'adjusted' && (
                                <div className="page-actions">
                                    <button onClick={promptForAdjust} className="btn-primary">Xác Nhận Điều Chỉnh Tồn Kho</button>
                                </div>
                            )}
                        </>
                    ) : <p>Không có chênh lệch nào được ghi nhận.</p>
                    }
                </div>
            )}
        </div>
    );
};

export default StocktakeSessionPage;