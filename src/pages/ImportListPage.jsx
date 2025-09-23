import React, { useState, useMemo } from 'react';
import { doc, updateDoc, addDoc, Timestamp, collection, query, orderBy, deleteDoc } from 'firebase/firestore';
import { FiEdit, FiEye, FiChevronLeft, FiChevronRight, FiTrash2, FiCheckCircle } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { db } from '../firebaseConfig';
import { PAGE_SIZE } from '../constants';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import { useRealtimeNotification } from '../hooks/useRealtimeNotification';
import EditImportSlipModal from '../components/EditImportSlipModal';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { parseDateString, formatDate } from '../utils/dateUtils';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import NewDataNotification from '../components/NewDataNotification';

const ImportListPage = () => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [selectedSlip, setSelectedSlip] = useState(null);
    const [isViewModalOpen, setIsViewModalOpen] = useState(false);
    
    // === BẮT ĐẦU THAY ĐỔI CẤU TRÚC STATE ===
    const [confirmModal, setConfirmModal] = useState({ 
        isOpen: false, 
        item: null, 
        title: '', 
        message: '', 
        confirmText: '', 
        action: null // Thêm 'action' để biết cần làm gì
    });
    // === KẾT THÚC THAY ĐỔI CẤU TRÚC STATE ===

    const baseQuery = useMemo(() => query(collection(db, 'import_tickets'), orderBy("createdAt", "desc")), []);
    
    const { 
        documents: importSlips, 
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

    const handleConfirmImport = async (slipToConfirm) => {
        if (!slipToConfirm) return;
        const slip = slipToConfirm;
        
        try {
            for (const item of slip.items) {
                let expiryTimestamp = null;
                if (item.expiryDate && item.expiryDate.trim() !== '' && item.expiryDate.toUpperCase() !== 'N/A') {
                    const expiryDateObject = parseDateString(item.expiryDate);
                    if (!expiryDateObject) {
                        toast.error(`HSD của mặt hàng ${item.productName} (${item.lotNumber}) có định dạng sai. Vui lòng sửa lại.`);
                        return; // Dừng hàm ngay tại đây
                    }
                    expiryTimestamp = Timestamp.fromDate(expiryDateObject);
                }

                const importDateObject = parseDateString(slip.importDate);
                const importTimestamp = importDateObject ? Timestamp.fromDate(importDateObject) : Timestamp.now();

                const newLotData = {
                    importDate: importTimestamp,
                    productId: item.productId,
                    productName: item.productName,
                    lotNumber: item.lotNumber,
                    expiryDate: expiryTimestamp,
                    unit: item.unit,
                    packaging: item.packaging,
                    storageTemp: item.storageTemp,
                    team: item.team,
                    manufacturer: item.manufacturer,
                    quantityImported: Number(item.quantity),
                    quantityRemaining: Number(item.quantity),
                    notes: item.notes,
                    supplierName: slip.supplierName,
                };
                await addDoc(collection(db, "inventory_lots"), newLotData);
            }

            const slipDocRef = doc(db, "import_tickets", slip.id);
            await updateDoc(slipDocRef, { status: "completed" });
            
            toast.success('Xác nhận nhập kho thành công!');
            reset();
        } catch (error) {
            console.error("Lỗi khi xác nhận nhập kho: ", error);
            toast.error('Đã xảy ra lỗi khi xác nhận nhập kho.');
        }
    };

    const handleSaveSlipChanges = async (updatedSlip) => {
        try {
            const slipDocRef = doc(db, "import_tickets", updatedSlip.id);
            await updateDoc(slipDocRef, { 
                items: updatedSlip.items,
                description: updatedSlip.description,
                importDate: updatedSlip.importDate
            });

            setIsEditModalOpen(false);
            reset();
            toast.success('Cập nhật phiếu nhập thành công!');
        } catch (error) {
            console.error("Lỗi khi cập nhật phiếu nhập: ", error);
            toast.error('Đã xảy ra lỗi khi cập nhật.');
        }
    };
    
    const handleDeleteSlip = async (slipToDelete) => {
        if (!slipToDelete) return;
        
        toast.info(`Đang xóa phiếu nhập...`);
        try {
            const slipDocRef = doc(db, "import_tickets", slipToDelete.id);
            await deleteDoc(slipDocRef);
            toast.success(`Đã xóa thành công phiếu nhập của NCC "${slipToDelete.supplierName}".`);
            reset();
        } catch (error) {
            console.error("Lỗi khi xóa phiếu nhập: ", error);
            toast.error("Đã xảy ra lỗi khi xóa phiếu nhập.");
        }
    };

    // === BẮT ĐẦU CẬP NHẬT CÁC HÀM prompt... ===
    const promptForConfirm = (slip) => {
        setConfirmModal({
            isOpen: true,
            item: slip,
            action: 'confirm', // Gán hành động là 'confirm'
            title: "Xác nhận nhập kho?",
            message: `Bạn có chắc muốn xác nhận và đưa hàng trong phiếu của NCC "${slip.supplierName}" vào kho không? Thao tác này sẽ cập nhật tồn kho.`,
            confirmText: "Xác nhận"
        });
    };
    
    const promptForDelete = (slip) => {
        setConfirmModal({
            isOpen: true,
            item: slip,
            action: 'delete', // Gán hành động là 'delete'
            title: "Xác nhận xóa phiếu nhập?",
            message: `Bạn có chắc muốn xóa vĩnh viễn phiếu nhập của NCC "${slip.supplierName}" không? Thao tác này không thể hoàn tác.`,
            confirmText: "Vẫn xóa"
        });
    };
    // === KẾT THÚC CẬP NHẬT CÁC HÀM prompt... ===

    // === BẮT ĐẦU HÀM XỬ LÝ TRUNG TÂM MỚI ===
    const handleModalConfirm = () => {
        const { action, item } = confirmModal;
        
        // Đóng modal trước khi thực hiện hành động
        setConfirmModal({ isOpen: false, item: null, action: null });

        if (action === 'confirm') {
            handleConfirmImport(item);
        } else if (action === 'delete') {
            handleDeleteSlip(item);
        }
    };
    // === KẾT THÚC HÀM XỬ LÝ TRUNG TÂM MỚI ===

    const openEditModal = (slip) => { setSelectedSlip(slip); setIsEditModalOpen(true); };
    const openViewModal = (slip) => { setSelectedSlip(slip); setIsViewModalOpen(true); };
    
    return (
        <div>
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={handleModalConfirm} // <-- THAY ĐỔI QUAN TRỌNG
                onCancel={() => setConfirmModal({ isOpen: false, item: null, action: null })}
                confirmText={confirmModal.confirmText}
            />
            {isViewModalOpen && ( <ViewImportSlipModal slip={selectedSlip} onClose={() => setIsViewModalOpen(false)} /> )}
            {isEditModalOpen && ( <EditImportSlipModal slip={selectedSlip} onClose={() => setIsEditModalOpen(false)} onSave={handleSaveSlipChanges} /> )}
            
            <div className="page-header">
                <h1>Danh sách Phiếu Nhập Kho</h1>
            </div>

            <NewDataNotification
                isVisible={hasNewData}
                onRefresh={handleRefresh}
                message="Có phiếu nhập mới!"
            />

            {loading ? <Spinner /> : (
                <>
                    <table className="products-table list-page-table">
                        <thead>
                            <tr>
                                <th>Ngày tạo</th>
                                <th>Nhà cung cấp</th>
                                <th>Diễn giải</th>
                                <th>Trạng thái</th>
                                <th>Thao tác</th>
                            </tr>
                        </thead>
                        <tbody>
                            {importSlips.map(slip => (
                                <tr key={slip.id}>
                                    <td>{formatDate(slip.createdAt)}</td>
                                    <td>{slip.supplierName}</td>
                                    <td>{slip.description}</td>
                                    <td><StatusBadge status={slip.status} /></td>
                                    <td>
                                        <div className="action-buttons">
                                            <button className="btn-icon btn-view" title="Xem chi tiết" onClick={() => openViewModal(slip)}>
                                                <FiEye />
                                            </button>
                                            {slip.status === 'pending' && (
                                                <>
                                                    <button className="btn-icon btn-edit" title="Sửa phiếu" onClick={() => openEditModal(slip)}>
                                                        <FiEdit />
                                                    </button>
                                                    <button className="btn-icon btn-delete" title="Xóa phiếu" onClick={() => promptForDelete(slip)}>
                                                        <FiTrash2 />
                                                    </button>
                                                    <button className="btn-icon btn-confirm" title="Xác nhận nhập kho" onClick={() => promptForConfirm(slip)}>
                                                        <FiCheckCircle />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
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

export default ImportListPage;