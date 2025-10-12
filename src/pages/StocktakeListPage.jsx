// src/pages/StocktakeListPage.jsx
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, serverTimestamp, orderBy, doc, setDoc, writeBatch, onSnapshot, limit } from 'firebase/firestore';
import { PAGE_SIZE } from '../constants';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import { useRealtimeNotification } from '../hooks/useRealtimeNotification';
import NewDataNotification from '../components/NewDataNotification';
import CreateStocktakeModal from '../components/CreateStocktakeModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { deleteStocktakeSession } from '../services/stocktakeService';
import { toast } from 'react-toastify';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { FiChevronLeft, FiChevronRight, FiTrash2 } from 'react-icons/fi';

const StocktakeListPage = () => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });
    const navigate = useNavigate();
    // THÊM 2 ĐOẠN CODE NÀY VÀO
const [navigateToSession, setNavigateToSession] = useState(null);

useEffect(() => {
    if (navigateToSession) {
        navigate(navigateToSession);
    }
}, [navigateToSession, navigate]);
    
    const baseQuery = useMemo(() => query(collection(db, "stocktakes"), orderBy("createdAt", "desc")), []);
    const {
        documents: stocktakeSessions,
        loading,
        isLastPage,
        page,
        nextPage,
        prevPage,
        reset
    } = useFirestorePagination(baseQuery, PAGE_SIZE);

    const { hasNewData, dismissNewData } = useRealtimeNotification(baseQuery);

    const handleRefresh = () => {
        dismissNewData();
        reset();
    };

    const handleCreateStocktake = async (sessionData) => {
    setIsCreating(true);
    toast.info("Đang lấy dữ liệu tồn kho, vui lòng chờ...");
    try {
        let inventoryQuery;
        if (sessionData.scope === 'all') {
            inventoryQuery = query(collection(db, "inventory_lots"), where("quantityRemaining", ">", 0));
        } else {
            inventoryQuery = query(collection(db, "inventory_lots"), where("team", "==", sessionData.scope), where("quantityRemaining", ">", 0));
        }
        const querySnapshot = await getDocs(inventoryQuery);
        const inventorySnapshotItems = querySnapshot.docs.map(doc => {
            const data = doc.data();
            return {
                productId: data.productId || '',
                productName: data.productName || '',
                lotNumber: data.lotNumber !== undefined ? data.lotNumber : null,
                expiryDate: data.expiryDate || null,
                unit: data.unit || '',
                packaging: data.packaging || '',
                storageTemp: data.storageTemp || '',
                team: data.team || '',
                manufacturer: data.manufacturer || '',
                subGroup: data.subGroup || '',
                notes: data.notes || '',
                lotId: doc.id,
                systemQty: data.quantityRemaining || 0,
                countedQty: null,
                isNew: false
            };
        });

        const newStocktakeSessionRef = doc(collection(db, 'stocktakes'));
        await setDoc(newStocktakeSessionRef, {
            name: sessionData.sessionName, scope: sessionData.scope, status: 'in_progress', createdAt: serverTimestamp(),
        });

        toast.info(`Đã lấy ${inventorySnapshotItems.length} mục. Bắt đầu ghi dữ liệu...`);
        const itemsCollectionRef = collection(db, 'stocktakes', newStocktakeSessionRef.id, 'items');
        const MAX_BATCH_SIZE = 500;
        for (let i = 0; i < inventorySnapshotItems.length; i += MAX_BATCH_SIZE) {
            const batch = writeBatch(db);
            const chunk = inventorySnapshotItems.slice(i, i + MAX_BATCH_SIZE);
            chunk.forEach(item => {
                const newItemRef = doc(itemsCollectionRef, item.lotId);
                batch.set(newItemRef, item);
            });
            await batch.commit();
        }

        toast.success("Tạo phiên kiểm kê mới thành công!");
        
        // THAY ĐỔI QUAN TRỌNG:
        // 1. Đóng modal
        setIsCreateModalOpen(false);
        // 2. Gửi tín hiệu để useEffect thực hiện điều hướng
        setNavigateToSession(`/stocktakes/${newStocktakeSessionRef.id}`);

    } catch (error) {
        console.error("Lỗi khi tạo phiên kiểm kê: ", error);
        toast.error("Đã có lỗi xảy ra khi tạo phiên kiểm kê.");
    } finally {
        setIsCreating(false);
    }
};

    const promptForDelete = (session) => {
        setConfirmModal({
            isOpen: true,
            item: session,
            title: "Xác nhận xóa phiên kiểm kê?",
            message: `Bạn có chắc chắn muốn xóa phiên "${session.name}" không? Toàn bộ dữ liệu đếm của phiên này sẽ bị mất vĩnh viễn và không thể khôi phục.`,
            onConfirm: handleDeleteSession,
            confirmText: "Vẫn xóa"
        });
    };

    const handleDeleteSession = async () => {
        const sessionToDelete = confirmModal.item;
        if (!sessionToDelete) return;

        try {
            toast.info(`Đang xóa phiên "${sessionToDelete.name}"...`);
            await deleteStocktakeSession(sessionToDelete.id);
            toast.success(`Đã xóa thành công phiên kiểm kê.`);
            reset();
        } catch (error) {
            console.error("Lỗi khi xóa phiên kiểm kê: ", error);
            toast.error("Đã xảy ra lỗi khi xóa phiên kiểm kê.");
        } finally {
            setConfirmModal({ isOpen: false, item: null });
        }
    };

    return (
        <div className="stocktake-list-page-container">
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={handleDeleteSession}
                onCancel={() => setConfirmModal({ isOpen: false, item: null })}
                confirmText={confirmModal.confirmText}
            />

            {isCreateModalOpen && (
                <CreateStocktakeModal onClose={() => setIsCreateModalOpen(false)} onCreate={handleCreateStocktake} isCreating={isCreating} />
            )}
            <div className="page-header">
                <h1>Danh sách Phiên Kiểm Kê Kho</h1>
                <button onClick={() => setIsCreateModalOpen(true)} className="btn-primary">Tạo Phiên Mới</button>
            </div>
      
            <NewDataNotification
                isVisible={hasNewData}
                onRefresh={handleRefresh}
                message="Có phiên kiểm kê mới!"
            />

            {hasNewData && (
                <div className="new-data-notification">
                    <p>Có phiên kiểm kê mới!</p>
                    <button onClick={handleRefresh} className="btn-primary">Tải lại danh sách</button>
                </div>
            )}

            {loading ? <Spinner /> : (
                <>
                    <table className="products-table list-page-table">
                        <thead>
                            <tr>
                                <th>Tên Phiên Kiểm Kê</th>
                                <th>Ngày Tạo</th>
                                <th>Phạm Vi</th>
                                <th>Trạng Thái</th>
                                <th>Thao Tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {stocktakeSessions.length > 0 ? (
                                stocktakeSessions.map(session => (
                                    <tr key={session.id}>
                                        <td>{session.name}</td>
                                        <td>{session.createdAt?.toDate().toLocaleDateString('vi-VN')}</td>
                                        <td>{session.scope === 'all' ? 'Toàn bộ kho' : session.scope}</td>
                                        <td><StatusBadge status={session.status} /></td>
                                        <td>
                                            <div className="action-buttons">
                                                <button 
                                                    className="btn-secondary" 
                                                    style={{padding: '5px 10px', width: 'auto'}}
                                                    onClick={() => navigate(`/stocktakes/${session.id}`)}
                                                >
                                                    Xem/Thực hiện
                                                </button>
                                                
                                                {session.status === 'in_progress' && (
                                                    <button
                                                        className="btn-icon btn-delete"
                                                        title="Xóa phiên kiểm kê"
                                                        onClick={() => promptForDelete(session)}
                                                    >
                                                        <FiTrash2 />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr><td colSpan="5" style={{textAlign: 'center'}}>Chưa có phiên kiểm kê nào.</td></tr>
                            )}
                        </tbody>
                    </table>

                    <div className="pagination-controls">
                        <button onClick={prevPage} disabled={page <= 1 || loading}>
                            <FiChevronLeft /> Trang Trước
                        </button>
                        <span>Trang {page}</span>
                        <button onClick={nextPage} disabled={isLastPage || loading}>
                            Trang Tiếp <FiChevronRight />
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

export default StocktakeListPage;