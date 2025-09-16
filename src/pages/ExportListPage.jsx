// src/pages/ExportListPage.jsx
import React, { useState, useMemo } from 'react';
import { db } from '../firebaseConfig';
import { doc, updateDoc, getDoc, collection, query, orderBy } from 'firebase/firestore';
import { FiCheckCircle, FiXCircle, FiEdit, FiEye, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { PAGE_SIZE } from '../constants';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import ViewExportSlipModal from '../components/ViewExportSlipModal';
import EditExportSlipModal from '../components/EditExportSlipModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { formatDate } from '../utils/dateUtils';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

const ExportListPage = () => {
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, data: null, title: '', message: '', onConfirm: null, confirmText: 'Xác nhận' });

  // <-- THAY ĐỔI: Sử dụng hook phân trang
  const baseQuery = useMemo(() => query(collection(db, 'export_tickets'), orderBy("createdAt", "desc")), []);
  const {
    documents: exportSlips,
    loading,
    isLastPage,
    page,
    nextPage,
    prevPage,
    reset
  } = useFirestorePagination(baseQuery, PAGE_SIZE);

  const handleConfirmExport = async (slip) => {
    try {
      for (const item of slip.items) {
        const lotRef = doc(db, 'inventory_lots', item.lotId);
        const lotSnap = await getDoc(lotRef);
        if (lotSnap.exists()) {
          const currentQuantity = lotSnap.data().quantityRemaining;
          const newQuantityRemaining = currentQuantity - (item.quantityToExport || item.quantityExported);
          if (newQuantityRemaining < 0) {
            toast.error(`Lỗi: Tồn kho của lô ${item.lotNumber} không đủ để xuất.`);
            return;
          }
          await updateDoc(lotRef, { quantityRemaining: newQuantityRemaining });
        }
      }
      const slipRef = doc(db, 'export_tickets', slip.id);
      await updateDoc(slipRef, { status: 'completed' });
      toast.success('Xác nhận xuất kho thành công!');
      reset();
    } catch (error) {
      console.error("Lỗi khi xác nhận xuất kho: ", error);
      toast.error('Đã xảy ra lỗi khi xác nhận.');
    } finally {
        setConfirmModal({ isOpen: false });
    }
  };

  const handleCancelSlip = async (slip) => {
    try {
      const slipRef = doc(db, 'export_tickets', slip.id);
      await updateDoc(slipRef, { status: 'cancelled' });
      toast.success('Hủy phiếu xuất thành công!');
      reset();
    } catch (error) {
      console.error("Lỗi khi hủy phiếu: ", error);
      toast.error('Đã xảy ra lỗi khi hủy phiếu.');
    } finally {
        setConfirmModal({ isOpen: false });
    }
  };

  const handleSaveSlipChanges = async (updatedSlip) => {
    try {
      const slipDocRef = doc(db, "export_tickets", updatedSlip.id);
      await updateDoc(slipDocRef, { 
          items: updatedSlip.items,
          customer: updatedSlip.customer,
          description: updatedSlip.description
      });
      setIsEditModalOpen(false);
      reset();
      toast.success('Cập nhật phiếu xuất thành công!');
    } catch (error) {
      console.error("Lỗi khi cập nhật phiếu xuất: ", error);
      toast.error('Đã xảy ra lỗi khi cập nhật.');
    }
  };

  const promptAction = (action, slip) => {
    if (action === 'confirm') {
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận xuất kho?",
            message: `Bạn có chắc muốn xuất kho cho phiếu của khách hàng "${slip.customer}" không?`,
            onConfirm: () => handleConfirmExport(slip),
            confirmText: "Xác nhận"
        });
    } else if (action === 'cancel') {
        setConfirmModal({
            isOpen: true,
            title: "Xác nhận hủy phiếu?",
            message: `Bạn có chắc muốn HỦY phiếu xuất của khách hàng "${slip.customer}" không? Thao tác này sẽ không trừ tồn kho.`,
            onConfirm: () => handleCancelSlip(slip),
            confirmText: "Đồng ý hủy"
        });
    }
  };

  const openViewModal = (slip) => { setSelectedSlip(slip); setIsViewModalOpen(true); };
  
  const openEditModal = async (slip) => {
    const slipWithDetails = JSON.parse(JSON.stringify(slip));
    try {
      toast.info("Đang lấy dữ liệu tồn kho mới nhất...");
      for (const item of slipWithDetails.items) {
        if (item.lotId) {
          const lotRef = doc(db, 'inventory_lots', item.lotId);
          const lotSnap = await getDoc(lotRef);
          if (lotSnap.exists()) {
            item.quantityRemaining = lotSnap.data().quantityRemaining;
          } else {
            item.quantityRemaining = 0;
            toast.warn(`Lô ${item.lotNumber} không còn tồn tại trong kho.`);
          }
        }
      }
      setSelectedSlip(slipWithDetails);
      setIsEditModalOpen(true);
    } catch (error) {
      console.error("Lỗi khi lấy chi tiết lô để chỉnh sửa:", error);
      toast.error("Không thể lấy dữ liệu tồn kho mới nhất.");
    }
  };
  
  return (
    <div>
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={confirmModal.onConfirm}
        onCancel={() => setConfirmModal({ isOpen: false })}
        confirmText={confirmModal.confirmText}
      />
      {isEditModalOpen && ( <EditExportSlipModal slip={selectedSlip} onClose={() => setIsEditModalOpen(false)} onSave={handleSaveSlipChanges} /> )}
      {isViewModalOpen && ( <ViewExportSlipModal slip={selectedSlip} onClose={() => setIsViewModalOpen(false)} /> )}
     
      <div className="page-header">
        <h1>Danh sách Phiếu Xuất Kho</h1>
      </div>

      {loading ? <Spinner /> : (
        <>
            <table className="products-table list-page-table">
                <thead>
                <tr>
                    <th>Ngày tạo</th>
                    <th>Khách hàng / Nơi nhận</th>
                    <th>Diễn giải</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                </tr>
                </thead>
                <tbody>
                {exportSlips.length > 0 ? (
                    exportSlips.map(slip => (
                    <tr key={slip.id}>
                        <td>{slip.createdAt?.toDate().toLocaleDateString('vi-VN')}</td>
                        <td>{slip.customer}</td>
                        <td>{slip.description}</td>
                        <td><StatusBadge status={slip.status} /></td>
                        <td>
                        <div className="action-buttons">
                            <button className="btn-icon btn-view" title="Xem chi tiết" onClick={() => openViewModal(slip)}>
                                <FiEye />
                            </button>
                            {slip.status === 'pending' && (
                            <>
                                <button className="btn-icon btn-confirm" title="Xác nhận xuất kho" onClick={() => promptAction('confirm', slip)}>
                                    <FiCheckCircle />
                                </button>
                                <button className="btn-icon btn-edit" title="Sửa phiếu" onClick={() => openEditModal(slip)}>
                                    <FiEdit />
                                </button>
                                <button className="btn-icon btn-delete" title="Hủy phiếu" onClick={() => promptAction('cancel', slip)}>
                                    <FiXCircle />
                                </button>
                            </>
                            )}
                        </div>
                        </td>
                    </tr>
                    ))
                ) : (
                    <tr>
                    <td colSpan="5" style={{ textAlign: 'center' }}>Chưa có phiếu xuất kho nào.</td>
                    </tr>
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

export default ExportListPage;