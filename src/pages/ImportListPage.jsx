// src/pages/ImportListPage.jsx
import React, { useState, useMemo } from 'react';
import { doc, updateDoc, addDoc, Timestamp, collection, query, orderBy } from 'firebase/firestore';
import { FiEdit, FiEye, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { db } from '../firebaseConfig';
import { PAGE_SIZE } from '../constants';
import { useFirestorePagination } from '../hooks/useFirestorePagination';
import EditImportSlipModal from '../components/EditImportSlipModal';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { parseDateString } from '../utils/dateUtils';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

const ImportListPage = () => {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });
  
  // <-- THAY ĐỔI: Sử dụng hook phân trang
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

  const handleConfirmImport = async () => {
    const slip = confirmModal.item;
    if (!slip) return;
    try {
      for (const item of slip.items) {
        const expiryDateObject = parseDateString(item.expiryDate);
        if (!expiryDateObject) {
            toast.error(`HSD của mặt hàng ${item.productName} (${item.lotNumber}) có định dạng sai. Vui lòng sửa lại.`);
            setConfirmModal({ isOpen: false, item: null });
            return;
        }
        const expiryTimestamp = Timestamp.fromDate(expiryDateObject);
        const newLotData = {
          importDate: Timestamp.now(),
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
          supplier: slip.supplier,
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
    } finally {
        setConfirmModal({ isOpen: false, item: null });
    }
  };

  const handleSaveSlipChanges = async (updatedSlip) => {
    try {
      const slipDocRef = doc(db, "import_tickets", updatedSlip.id);
      await updateDoc(slipDocRef, { items: updatedSlip.items });
      setIsEditModalOpen(false);
      reset();
      toast.success('Cập nhật phiếu nhập thành công!');
    } catch (error) {
      console.error("Lỗi khi cập nhật phiếu nhập: ", error);
      toast.error('Đã xảy ra lỗi khi cập nhật.');
    }
  };

  const promptForConfirm = (slip) => {
    setConfirmModal({
        isOpen: true,
        item: slip,
        title: "Xác nhận nhập kho?",
        message: `Bạn có chắc muốn xác nhận và đưa hàng trong phiếu của NCC "${slip.supplier}" vào kho không? Thao tác này sẽ cập nhật tồn kho.`,
    });
  };

  const openEditModal = (slip) => { setSelectedSlip(slip); setIsEditModalOpen(true); };
  const openViewModal = (slip) => { setSelectedSlip(slip); setIsViewModalOpen(true); };
  
  return (
    <div>
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        onConfirm={handleConfirmImport}
        onCancel={() => setConfirmModal({ isOpen: false, item: null })}
        confirmText="Xác nhận"
      />
      {isViewModalOpen && ( <ViewImportSlipModal slip={selectedSlip} onClose={() => setIsViewModalOpen(false)} /> )}
      {isEditModalOpen && ( <EditImportSlipModal slip={selectedSlip} onClose={() => setIsEditModalOpen(false)} onSave={handleSaveSlipChanges} /> )}
      
      <div className="page-header">
        <h1>Danh sách Phiếu Nhập Kho</h1>
      </div>

      {loading ? <Spinner /> : (
        <>
            <table className="products-table">
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
                    <td>{slip.createdAt?.toDate().toLocaleDateString('vi-VN')}</td>
                    <td>{slip.supplier}</td>
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
                            <button className="btn-primary" onClick={() => promptForConfirm(slip)}>
                                Xác nhận
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