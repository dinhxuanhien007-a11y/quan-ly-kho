// src/pages/ImportListPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, doc, updateDoc, addDoc, Timestamp, limit, startAfter } from 'firebase/firestore';
import EditImportSlipModal from '../components/EditImportSlipModal';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { FiEdit, FiEye, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import { parseDateString } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';

const PAGE_SIZE = 15; // SỐ PHIẾU TRÊN MỖI TRANG

const ImportListPage = () => {
  const [importSlips, setImportSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });

  // --- STATE MỚI CHO PHÂN TRANG ---
  const [lastVisible, setLastVisible] = useState(null);
  const [page, setPage] = useState(1);
  const [isLastPage, setIsLastPage] = useState(false);

  const fetchImportSlips = useCallback(async (direction = 'next') => {
    setLoading(true);
    try {
      let slipsQuery = query(collection(db, "import_tickets"), orderBy("createdAt", "desc"));

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
      setImportSlips(slipsList);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách phiếu nhập: ", error);
      toast.error("Không thể tải danh sách phiếu nhập.");
    } finally {
      setLoading(false);
    }
  }, [lastVisible]);

  useEffect(() => {
    fetchImportSlips('first');
  }, []);

  const handleNextPage = () => {
    if (!isLastPage) {
        setPage(prev => prev + 1);
        fetchImportSlips('next');
    }
  };

  const handlePrevPage = () => {
    // Để đơn giản, khi nhấn Previous, ta tải lại từ đầu
    setLastVisible(null);
    fetchImportSlips('first');
  };
  
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
      fetchImportSlips('first');
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
      fetchImportSlips('first');
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

export default ImportListPage;