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
import useStocktakeStore from '../stores/stocktakeStore';

const PAGE_SIZE = 50;

// Component con không thay đổi
const CountInput = ({ item, onCountSubmit }) => {
    const { id, countedQty, isNew } = item;
    const updateItemCountInUI = useStocktakeStore(state => state.updateItemCountInUI);
    const sessionData = useStocktakeStore(state => state.sessionData);
    const isSessionInProgress = sessionData?.status === 'in_progress';
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.target.blur();
        }
    };

    return (
        <input 
            type="text"
            placeholder="Nhập số đếm" 
            value={countedQty ?? ''}
            onChange={e => updateItemCountInUI(id, e.target.value)}
            onBlur={e => onCountSubmit(id, e.target.value)}
            onKeyDown={handleKeyDown} 
            disabled={!isSessionInProgress}
            style={{ 
                backgroundColor: isNew ? '#fff9e6' : 
                    ((countedQty !== null && countedQty !== '') ? '#e6fffa' : '#fff') 
            }}
        />
    );
};

// =================================================================
// === BẮT ĐẦU HÀM HELPER MỚI ĐỂ TÍNH TOÁN BIỂU THỨC AN TOÀN ===
// =================================================================
/**
 * Tính toán một biểu thức toán học đơn giản một cách an toàn.
 * Hỗ trợ các chuỗi như "300+200", "600-100".
 * @param {string} str - Chuỗi biểu thức đầu vào.
 * @returns {number|NaN} - Kết quả tính toán hoặc NaN nếu không hợp lệ.
 */
const evaluateMathExpression = (str) => {
    try {
        // Chỉ cho phép các ký tự số, +, -, và khoảng trắng
        if (/[^0-9\s+\-]/.test(str)) {
            return NaN;
        }
        // Thay thế nhiều dấu -- thành +
        const sanitizedStr = str.replace(/--/g, '+');
        
        // Sử dụng Function constructor để tránh rủi ro bảo mật của eval()
        return new Function(`return ${sanitizedStr}`)();
    } catch (error) {
        return NaN;
    }
};
// ===============================================================
// === KẾT THÚC HÀM HELPER MỚI ===
// ===============================================================


const StocktakeSessionPage = () => {
    const { sessionId } = useParams();
    const navigate = useNavigate();
    const {
        sessionData, items, discrepancyItems, checkedItems, summaryStats, loading,
        initializeSession, setItems, setSummary, setSessionStatus,
        toggleCheckedItem, toggleAllCheckedItems, clearStore, updateItemCountInUI
    } = useStocktakeStore();
    const [loadingItems, setLoadingItems] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [lastVisible, setLastVisible] = useState(null);
    const [page, setPage] = useState(1);
    const [isLastPage, setIsLastPage] = useState(false);
    const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false });

    const performCountUpdate = async (itemId, finalCount) => {
        updateItemCountInUI(itemId, finalCount);
        const itemRef = doc(db, 'stocktakes', sessionId, 'items', itemId);
        try {
            await updateDoc(itemRef, { countedQty: finalCount });
            await fetchStatsAndDiscrepancies();
            return true;
        } catch (error) {
            toast.error("Lỗi: Không thể lưu số lượng.");
            return false;
        }
    };

    // =================================================================
    // === BẮT ĐẦU PHẦN LOGIC handleCountSubmit ĐÃ ĐƯỢC VIẾT LẠI HOÀN TOÀN ===
    // =================================================================
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

        // Trường hợp 1: Cộng dồn nhanh (bắt đầu bằng '+')
        if (rawValue.startsWith('+')) {
            const addedValue = evaluateMathExpression(rawValue.substring(1));
            if (!isNaN(addedValue) && addedValue > 0) {
                finalCount = prevCountedQty + addedValue;
            } else {
                 toast.warn("Giá trị cộng dồn không hợp lệ.");
            }
        } else {
            // Trường hợp 2: Tính toán biểu thức hoặc ghi đè số
            finalCount = evaluateMathExpression(rawValue);
        }

        // Kiểm tra kết quả cuối cùng
        if (isNaN(finalCount) || finalCount < 0) {
            toast.warn("Giá trị nhập không hợp lệ.");
            updateItemCountInUI(itemId, item.countedQtyBeforeSubmit ?? null); // Hoàn lại giá trị cũ
        } else {
            performCountUpdate(itemId, finalCount);
        }
    };
    // ===============================================================
    // === KẾT THÚC PHẦN LOGIC handleCountSubmit MỚI ===
    // ===============================================================

    const fetchStatsAndDiscrepancies = useCallback(async () => {
        if (!sessionId) return;
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

        const newSummary = {
            totalItems: totalSnap.data().count,
            countedItems: countedDocsSnap.size,
            discrepancies: discrepancies.length
        };
        const sortedDiscrepancies = discrepancies.sort((a, b) => a.productId.localeCompare(b.productId));
        setSummary(newSummary, sortedDiscrepancies);
    }, [sessionId, setSummary]);

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
        }
    }, [sessionId, navigate, initializeSession, clearStore, fetchStatsAndDiscrepancies]);

    const buildItemsQuery = useCallback(() => {
        const itemsCollectionRef = collection(db, 'stocktakes', sessionId, 'items');
        let q = query(itemsCollectionRef, orderBy('productId'));
        if (searchTerm) {
            const upperSearchTerm = searchTerm.toUpperCase();
            q = query(q, where('productId', '>=', upperSearchTerm), where('productId', '<=', upperSearchTerm + '\uf8ff'));
        }
        return q;
    }, [sessionId, searchTerm]);

    const fetchItemsPage = useCallback(async (newQuery, isNextPage = false) => {
        if (!sessionId) return;
        setLoadingItems(true);
        try {
            const docSnapshots = await getDocs(newQuery);
            const itemsList = docSnapshots.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data()
            }));
            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setItems(itemsList);
            if (!isNextPage) setPage(1);
        } catch (error) {
            console.error("Lỗi khi tải vật tư kiểm kê: ", error);
            toast.error("Không thể tải danh sách vật tư.");
        } finally {
            setLoadingItems(false);
        }
    }, [sessionId, setItems]);

    useEffect(() => {
        const q = buildItemsQuery();
        const firstPageQuery = query(q, limit(PAGE_SIZE));
        const debounce = setTimeout(() => {
            fetchItemsPage(firstPageQuery);
        }, 500);
        return () => clearTimeout(debounce);
    }, [searchTerm, buildItemsQuery, fetchItemsPage]);

    const handleFinalizeCount = async () => {
        setConfirmModal({isOpen: false});
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
            const q = buildItemsQuery();
            const firstPageQuery = query(q, limit(PAGE_SIZE));
            fetchItemsPage(firstPageQuery);
            setIsAddItemModalOpen(false);
        } catch (error) {
            toast.error("Có lỗi khi lưu mặt hàng mới, vui lòng thử lại.");
        }
    };

    const handleAdjustInventory = async () => {
        setConfirmModal({isOpen: false});
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
                }
                const newAdjustmentRef = doc(adjustmentsCollectionRef);
                batch.set(newAdjustmentRef, {
                    createdAt: serverTimestamp(), stocktakeId: sessionId, productId: item.productId,
                    productName: item.productName, lotNumber: item.lotNumber, quantityBefore: item.systemQty,
                    quantityAfter: finalCountedQty, variance: finalCountedQty - item.systemQty,
                    reason: `Điều chỉnh sau kiểm kê phiên: ${sessionData.name}`
                });
            }
            const sessionRef = doc(db, 'stocktakes', sessionId);
            batch.update(sessionRef, { status: 'adjusted' });
            await batch.commit();
            setSessionStatus('adjusted');
            toast.success("Đã điều chỉnh tồn kho thành công!");
        } catch (error) {
            toast.error("Đã xảy ra lỗi khi điều chỉnh tồn kho.");
        }
    };
    
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
    
    if (loading) return <Spinner />;
    if (!sessionData) return <div>Không tìm thấy dữ liệu cho phiên kiểm kê này.</div>;

    const isSessionInProgress = sessionData.status === 'in_progress';

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
                                    <th>HSD</th><th>ĐVT</th><th>Quy cách</th><th>Tồn hệ thống</th><th>Tồn thực tế</th>
                                </tr>
                            </thead>
                            <tbody>
                                 {items.map((item) => (
        <tr key={item.id}>
            <td>{item.productId}</td>
            <td>{item.productName}</td>
            <td>{item.lotNumber}</td>
            <td>{formatDate(item.expiryDate)}</td>
            <td>{item.unit}</td>
            <td>{item.packaging}</td>
            <td>{item.systemQty}</td>
            <td>
                <CountInput item={item} onCountSubmit={handleCountSubmit} />
                                        </td>
                                     </tr>
                                ))}
                            </tbody>
                        </table>
                     </div>
                    {!searchTerm && (
                        <div className="pagination-controls">
                            <button onClick={() => {
                                     const q = buildItemsQuery();
                                     const firstPageQuery = query(q, limit(PAGE_SIZE));
                                fetchItemsPage(firstPageQuery);
                            }} disabled={page <= 1}>
                                <FiChevronLeft /> Trang Đầu
                            </button>
                             <span>Trang {page}</span>
                            <button onClick={() => {
                                const q = buildItemsQuery();
                                const nextPageQuery = query(q, startAfter(lastVisible), limit(PAGE_SIZE));
                                fetchItemsPage(nextPageQuery, true);
                                setPage(p => p + 1);
                            }} disabled={isLastPage}>
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
                            <table className="products-table discrepancy-table">
                                 <thead>
                                    <tr>
                                        <th><input type="checkbox" onChange={(e) => toggleAllCheckedItems(e.target.checked)} disabled={sessionData.status === 'adjusted'} /></th>
                                         <th>Mã hàng</th><th>Tên hàng</th><th>Số lô</th>
                                        <th>Tồn hệ thống</th><th>Tồn thực tế</th><th>Chênh lệch</th>
                                   </tr>
                                </thead>
                                <tbody>
                                     {discrepancyItems.map(item => (
                                        <tr key={item.id}>
                                             <td><input type="checkbox" checked={!!checkedItems[item.id]} onChange={() => toggleCheckedItem(item.id)} disabled={sessionData.status === 'adjusted'} /></td>
                                            <td>{item.productId}</td><td>{item.productName}</td><td>{item.lotNumber}</td>
                                             <td>{item.systemQty}</td><td><strong>{item.countedQty ?? 0}</strong></td>
                                            <td style={{color: (item.countedQty ?? 0) > item.systemQty ? 'green' : 'red', fontWeight: 'bold'}}>{(item.countedQty ?? 0) - item.systemQty}</td>
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