// src/pages/ExportListPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, doc, updateDoc, getDoc, limit, startAfter } from 'firebase/firestore';
import ViewExportSlipModal from '../components/ViewExportSlipModal';
import EditExportSlipModal from '../components/EditExportSlipModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { FiCheckCircle, FiXCircle, FiEdit, FiEye, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-toastify';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 15; // SỐ PHIẾU TRÊN MỖI TRANG

const ExportListPage = () => {
  const [exportSlips, setExportSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, data: null, title: '', message: '', onConfirm: null, confirmText: 'Xác nhận' });

  // --- STATE MỚI CHO PHÂN TRANG ---
  const [lastVisible, setLastVisible] = useState(null);
  const [page, setPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);

  const fetchExportSlips = useCallback(async (direction = 'next') => {
    setLoading(true);
    try {
      let slipsQuery = query(collection(db, "export_tickets"), orderBy("createdAt", "desc"));

      if (direction === 'next' && lastVisible) {
        slipsQuery = query(slipsQuery, startAfter(lastVisible), limit(PAGE_SIZE));
      } else { // 'first' or default
        slipsQuery = query(slipsQuery, limit(PAGE_SIZE));
        setPage(1);
      }
      
      const querySnapshot = await getDocs(slipsQuery);
      const slipsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      setLastVisible(querySnapshot.docs[querySnapshot.docs.length - 1]);
      setIsLastPage(querySnapshot.docs.length < PAGE_SIZE);
      setExportSlips(slipsList);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách phiếu xuất: ", error);
      toast.error("Không thể tải danh sách phiếu xuất.");
    } finally {
      setLoading(false);
    }
  }, [lastVisible]);

  useEffect(() => {
    fetchExportSlips('first');
  }, []);

  const handleNextPage = () => {
    if (!isLastPage) {
        setPage(prev => prev + 1);
        fetchExportSlips('next');
    }
  };

  const handlePrevPage = () => {
    setLastVisible(null);
    fetchExportSlips('first');
  };

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
      fetchExportSlips('first');
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
      fetchExportSlips('first');
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
      fetchExportSlips('first');
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
  const openEditModal = (slip) => { setSelectedSlip(slip); setIsEditModalOpen(true); };
  
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
            <table className="products-table">
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
                <button onClick={handlePrevPage} disabled={page <= 1}>
                    <FiChevronLeft /> Trang Trước
                </button>
                <span>Trang {page}</span>
                <button onClick={handleNextPage} disabled={isLastPage}>
                    Trang Tiếp <FiChevronRight />
                </button>
            </div>
        </>
      )}
    </div>
  );
};

export default ExportListPage;