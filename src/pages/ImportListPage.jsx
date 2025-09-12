// src/pages/ImportListPage.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, doc, updateDoc, addDoc, Timestamp } from 'firebase/firestore';
import EditImportSlipModal from '../components/EditImportSlipModal';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import ConfirmationModal from '../components/ConfirmationModal';
import { FiEdit, FiEye } from 'react-icons/fi';
import { parseDateString } from '../utils/dateUtils';
import { toast } from 'react-toastify';

const ImportListPage = () => {
  const [importSlips, setImportSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, item: null });

  const fetchImportSlips = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "import_tickets"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const slipsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setImportSlips(slipsList);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách phiếu nhập: ", error);
      toast.error("Không thể tải danh sách phiếu nhập.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImportSlips();
  }, []);

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
      fetchImportSlips();
    } catch (error) {
      console.error("Lỗi khi xác nhận nhập kho: ", error);
      toast.error('Đã xảy ra lỗi khi xác nhận nhập kho.');
    } finally {
        setConfirmModal({ isOpen: false, item: null });
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

  const openEditModal = (slip) => {
    setSelectedSlip(slip);
    setIsEditModalOpen(true);
  };

  const openViewModal = (slip) => {
    setSelectedSlip(slip);
    setIsViewModalOpen(true);
  };

  const handleSaveSlipChanges = async (updatedSlip) => {
    try {
      const slipDocRef = doc(db, "import_tickets", updatedSlip.id);
      await updateDoc(slipDocRef, { items: updatedSlip.items });
      setIsEditModalOpen(false);
      fetchImportSlips();
      toast.success('Cập nhật phiếu nhập thành công!');
    } catch (error) {
      console.error("Lỗi khi cập nhật phiếu nhập: ", error);
      toast.error('Đã xảy ra lỗi khi cập nhật.');
    }
  };

  if (loading) {
    return <div>Đang tải danh sách phiếu nhập...</div>;
  }

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
      {isViewModalOpen && (
        <ViewImportSlipModal 
          slip={selectedSlip} 
          onClose={() => setIsViewModalOpen(false)}
        />
      )}
      {isEditModalOpen && (
        <EditImportSlipModal 
          slip={selectedSlip} 
          onClose={() => setIsEditModalOpen(false)}
          onSave={handleSaveSlipChanges}
        />
      )}
      <div className="page-header">
        <h1>Danh sách Phiếu Nhập Kho</h1>
      </div>
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
              <td>
                <span className={`status-badge status-${slip.status}`}>
                  {slip.status === 'pending' ? 'Đang chờ' : 'Hoàn thành'}
                </span>
              </td>
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
    </div>
  );
};

export default ImportListPage;