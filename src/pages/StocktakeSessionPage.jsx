// src/pages/StocktakeSessionPage.jsx
import { FiPrinter } from 'react-icons/fi';
import { exportStocktakeToPDF } from '../utils/pdfUtils';
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { doc, getDoc, updateDoc, writeBatch, collection, addDoc, serverTimestamp, query, orderBy, limit, startAfter, getDocs, where, getCountFromServer, setDoc, documentId, Timestamp } from 'firebase/firestore';
import '../styles/StocktakePage.css';
import AddUnlistedItemModal from '../components/AddUnlistedItemModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate, parseDateString, getRowColorByExpiry } from '../utils/dateUtils';
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

    // useEffect MỚI: Chỉ dùng để tải dữ liệu lần đầu tiên
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

    // HÀM MỚI: Thay thế hàm handleSearch rỗng trước đó
    const handleSearch = async (e) => {
        const term = e.target.value;
        setSearchTerm(term); // Cập nhật state ngay khi gõ

        if (e.key !== 'Enter') return;

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
        } catch (error) {
            console.error("Lỗi khi tìm kiếm vật tư: ", error);
            toast.error("Không thể tìm kiếm danh sách vật tư.");
        } finally {
            setLoadingItems(false);
        }
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
            // Tải lại trang đầu tiên sau khi thêm
            const q = query(collection(db, 'stocktakes', sessionId, 'items'), orderBy('productId'), limit(PAGE_SIZE));
            // Tạo một hàm tạm để fetch
            const fetchAgain = async () => {
                const docSnapshots = await getDocs(q);
                const itemsList = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data(), countedQtyBeforeSubmit: doc.data().countedQty ?? null }));
                setItems(itemsList);
                setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
                setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
                setPage(1);
            }
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
                
                // KIỂM TRA NẾU KHÔNG PHẢI LÀ HÀNG MỚI (LOGIC CŨ)
                if (!item.isNew) {
                    const inventoryLotRef = doc(db, 'inventory_lots', item.lotId);
                    batch.update(inventoryLotRef, { quantityRemaining: finalCountedQty });
                }
                // LOGIC MỚI: NẾU LÀ HÀNG MỚI, TẠO MỘT LÔ TỒN KHO MỚI
                else {
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
            const itemsList = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data(), countedQtyBeforeSubmit: doc.data().countedQty ?? null }));
            setItems(itemsList);
            setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
            setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
            setPage(p => p + 1);
        } catch (error) {
            toast.error("Lỗi khi tải trang tiếp theo.");
        } finally {
            setLoadingItems(false);
        }
    };

    const handlePrevPage = async () => {
        // Pagination về trang trước phức tạp hơn với cursor,
        // tạm thời chỉ làm chức năng quay về trang đầu
        const itemsCollectionRef = collection(db, 'stocktakes', sessionId, 'items');
        let q = query(itemsCollectionRef, orderBy('productId'));
         if (searchTerm) {
            const upperSearchTerm = searchTerm.toUpperCase();
            q = query(q, where('productId', '>=', upperSearchTerm), where('productId', '<=', upperSearchTerm + '\uf8ff'));
        }
        const firstPageQuery = query(q, limit(PAGE_SIZE));
        // Gọi lại logic fetch của useEffect
        const fetchFirstPage = async () => {
             setLoadingItems(true);
             try {
                const docSnapshots = await getDocs(firstPageQuery);
                const itemsList = docSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data(), countedQtyBeforeSubmit: doc.data().countedQty ?? null }));
                setItems(itemsList);
                setLastVisible(docSnapshots.docs[docSnapshots.docs.length - 1]);
                setIsLastPage(docSnapshots.docs.length < PAGE_SIZE);
                setPage(1);
             } catch(e) { toast.error("Lỗi khi tải lại trang đầu."); }
             finally { setLoadingItems(false); }
        }
        fetchFirstPage();
    };

    // Dán vào file: src/pages/StocktakeSessionPage.jsx

    const handleExportPDF = async () => {
        const session = useStocktakeStore.getState().sessionData;
        if (!session) {
            toast.warn("Chưa có dữ liệu phiên để xuất file PDF.");
            return;
        }
        
        toast.info("Đang tải toàn bộ dữ liệu để tạo file PDF...");
        try {
            const itemsRef = collection(db, 'stocktakes', sessionId, 'items');
            
            // --- THAY ĐỔI TẠI ĐÂY: Sắp xếp theo 'productId' ---
            const q = query(itemsRef, orderBy('productId')); 
            
            const querySnapshot = await getDocs(q);
            const allItems = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            if (allItems.length === 0) {
                toast.warn("Phiên kiểm kê này không có sản phẩm nào để xuất ra file.");
                return;
            }

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
            {isAddItemModalOpen && (<AddUnlistedItemModal onClose={() => setIsAddItemModalOpen(false)} onAddItem={handleAddUnlistedItem} />)}

            <div className="page-header">
    <h1>{sessionData.name} <StatusBadge status={sessionData.status} /></h1>
    <div className="header-actions"> {/* <-- Bọc các nút vào div này */}
        {/* --- THÊM NÚT NÀY VÀO ĐÂY --- */}
        <button onClick={handleExportPDF} className="btn-secondary">
            <FiPrinter style={{ marginRight: '5px' }} />
            Xuất PDF Kiểm kê
        </button>
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
                     <input 
                        type="text" 
                        placeholder="Tìm Mã hàng rồi nhấn Enter..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                        onKeyDown={handleSearch} 
                        className="search-input" />
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
                                    <th>HSD</th><th>ĐVT</th><th>Quy cách</th><th>Tồn hệ thống</th><th>Tồn thực tế</th><th>Nhóm hàng</th>
                                </tr>
                            </thead>
                            <tbody>
                                 {items.map((item) => (
    <tr 
        key={item.id}
        // --- THÊM DÒNG NÀY: Tính toán và áp dụng class màu sắc dựa trên HSD ---
        className={getRowColorByExpiry(item.expiryDate, item.subGroup)} 
    >
        <td>{item.productId}</td>
                                        <td>{item.productName}</td>
                                        <td>{item.lotNumber || '(Không có)'}</td>
                                        <td>{item.expiryDate ? formatDate(item.expiryDate) : '(Không có)'}</td>
                                        <td>{item.unit}</td>
                                        <td>{item.packaging}</td>
                                        <td>{item.systemQty}</td>
                                        <td>
    <CountInput item={item} onCountSubmit={handleCountSubmit} />
</td>
<td>{item.subGroup}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    {!searchTerm && (
                        <div className="pagination-controls">
                            <button onClick={handlePrevPage}>
                                <FiChevronLeft /> Trang Đầu
                            </button>
                             <span>Trang {page}</span>
                            <button onClick={handleNextPage} disabled={isLastPage}>
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
                    _           </div>
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