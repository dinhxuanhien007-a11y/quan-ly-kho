// src/pages/ImportListPage.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, doc, updateDoc, addDoc, Timestamp } from 'firebase/firestore';
import EditImportSlipModal from '../components/EditImportSlipModal';
import ViewImportSlipModal from '../components/ViewImportSlipModal';
import { FiEdit, FiEye } from 'react-icons/fi';
import { parseDateString } from '../utils/dateUtils';

const ImportListPage = () => {
  const [importSlips, setImportSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);

  const fetchImportSlips = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "import_tickets"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const slipsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setImportSlips(slipsList);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách phiếu nhập: ", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchImportSlips();
  }, []);

  const handleConfirmImport = async (slip) => {
    if (!window.confirm(`Bạn có chắc muốn xác nhận nhập kho cho phiếu của NCC "${slip.supplier}" không?`)) {
      return;
    }
    try {
      for (const item of slip.items) {
        const expiryDateObject = parseDateString(item.expiryDate);
        if (!expiryDateObject) {
            alert(`HSD của mặt hàng ${item.productName} (${item.lotNumber}) có định dạng sai. Vui lòng sửa lại.`);
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
          // --- THAY ĐỔI QUAN TRỌNG ---
          // Thêm tên nhà cung cấp từ phiếu nhập vào dữ liệu lô hàng
          supplier: slip.supplier,
        };
        await addDoc(collection(db, "inventory_lots"), newLotData);
      }
      const slipDocRef = doc(db, "import_tickets", slip.id);
      await updateDoc(slipDocRef, { status: "completed" });
      alert('Xác nhận nhập kho thành công!');
      fetchImportSlips();
    } catch (error) {
      console.error("Lỗi khi xác nhận nhập kho: ", error);
      alert('Đã xảy ra lỗi khi xác nhận nhập kho.');
    }
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
      alert('Cập nhật phiếu nhập thành công!');
    } catch (error) {
      console.error("Lỗi khi cập nhật phiếu nhập: ", error);
      alert('Đã xảy ra lỗi khi cập nhật.');
    }
  };

  if (loading) {
    return <div>Đang tải danh sách phiếu nhập...</div>;
  }

  return (
    <div>
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
                      <button className="btn-primary" onClick={() => handleConfirmImport(slip)}>
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