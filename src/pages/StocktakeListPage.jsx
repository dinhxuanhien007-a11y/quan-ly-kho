// src/pages/StocktakeListPage.jsx
import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebaseConfig';
import { collection, query, where, getDocs, serverTimestamp, orderBy, doc, setDoc, writeBatch } from 'firebase/firestore';
import { PAGE_SIZE } from '../constants';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import CreateStocktakeModal from '../components/CreateStocktakeModal';
import ConfirmationModal from '../components/ConfirmationModal'; // <-- NÂNG CẤP: Import component xác nhận
import { deleteStocktakeSession } from '../services/stocktakeService'; // <-- NÂNG CẤP: Import hàm xóa mới
import { toast } from 'react-toastify';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import { FiChevronLeft, FiChevronRight, FiTrash2 } from 'react-icons/fi'; // <-- NÂNG CẤP: Import icon thùng rác

const StocktakeListPage = () => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null }); // <-- NÂNG CẤP: Thêm state cho modal xác nhận
    const navigate = useNavigate();
    
    const baseQuery = useMemo(() => query(collection(db, "stocktakes"), orderBy("createdAt", "desc")), []);
    const {
        documents: stocktakeSessions,
        loading,
        isLastPage,
        page,
        nextPage,
        prevPage,
        reset // <-- NÂNG CẤP: Sử dụng hàm reset từ hook
    } = useFirestorePagination(baseQuery, PAGE_SIZE);

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
            const inventorySnapshotItems = querySnapshot.docs.map(doc => ({
                lotId: doc.id, ...doc.data(), systemQty: doc.data().quantityRemaining, countedQty: null, isNew: false, 
            }));

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
            setIsCreateModalOpen(false);
            navigate(`/stocktakes/${newStocktakeSessionRef.id}`);
        } catch (error) {
            console.error("Lỗi khi tạo phiên kiểm kê: ", error);
            toast.error("Đã có lỗi xảy ra khi tạo phiên kiểm kê.");
        } finally {
            setIsCreating(false);
        }
    };

    // <-- NÂNG CẤP: Hàm để mở hộp thoại xác nhận xóa -->
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

    // <-- NÂNG CẤP: Hàm thực hiện việc xóa sau khi xác nhận -->
    const handleDeleteSession = async () => {
        const sessionToDelete = confirmModal.item;
        if (!sessionToDelete) return;

        try {
            toast.info(`Đang xóa phiên "${sessionToDelete.name}"...`);
            await deleteStocktakeSession(sessionToDelete.id);
            toast.success(`Đã xóa thành công phiên kiểm kê.`);
            reset(); // Tải lại danh sách
        } catch (error) {
            console.error("Lỗi khi xóa phiên kiểm kê: ", error);
            toast.error("Đã xảy ra lỗi khi xóa phiên kiểm kê.");
        } finally {
            setConfirmModal({ isOpen: false, item: null });
        }
    };

    return (
        <div className="stocktake-list-page-container">
            {/* <-- NÂNG CẤP: Thêm component Modal vào giao diện --> */}
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
                                            {/* <-- NÂNG CẤP: Bọc các nút trong div để dễ sắp xếp --> */}
                                            <div className="action-buttons">
                                                <button 
                                                    className="btn-secondary" 
                                                    style={{padding: '5px 10px', width: 'auto'}}
                                                    onClick={() => navigate(`/stocktakes/${session.id}`)}
                                                >
                                                    Xem/Thực hiện
                                                </button>
                                                
                                                {/* <-- NÂNG CẤP: Hiển thị nút xóa có điều kiện --> */}
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