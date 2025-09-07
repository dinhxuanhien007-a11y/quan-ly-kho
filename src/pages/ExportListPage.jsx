// src/pages/ExportListPage.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../firebaseConfig';
import { collection, getDocs, query, orderBy, doc, updateDoc, getDoc } from 'firebase/firestore';
import ViewExportSlipModal from '../components/ViewExportSlipModal';
import EditExportSlipModal from '../components/EditExportSlipModal'; // BƯỚC 1: IMPORT MODAL MỚI
import { FiCheckCircle, FiXCircle, FiEdit, FiEye } from 'react-icons/fi';

const ExportListPage = () => {
  const [exportSlips, setExportSlips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlip, setSelectedSlip] = useState(null);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  
  // BƯỚC 2: THÊM STATE ĐỂ QUẢN LÝ MODAL SỬA
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const fetchExportSlips = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, "export_tickets"), orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(q);
      const slipsList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setExportSlips(slipsList);
    } catch (error) {
      console.error("Lỗi khi lấy danh sách phiếu xuất: ", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExportSlips();
  }, []);

  const handleConfirmExport = async (slip) => {
    if (!window.confirm(`Bạn có chắc muốn xác nhận xuất kho cho phiếu của khách hàng "${slip.customer}" không?`)) {
      return;
    }
    try {
      for (const item of slip.items) {
        const lotRef = doc(db, 'inventory_lots', item.lotId);
        const lotSnap = await getDoc(lotRef);
        if (lotSnap.exists()) {
          const currentQuantity = lotSnap.data().quantityRemaining;
          const newQuantityRemaining = currentQuantity - item.quantityToExport;
          if (newQuantityRemaining < 0) {
            alert(`Lỗi: Tồn kho của lô ${item.lotNumber} không đủ để xuất.`);
            return;
          }
          await updateDoc(lotRef, { quantityRemaining: newQuantityRemaining });
        }
      }
      const slipRef = doc(db, 'export_tickets', slip.id);
      await updateDoc(slipRef, { status: 'completed' });
      alert('Xác nhận xuất kho thành công!');
      fetchExportSlips();
    } catch (error) {
      console.error("Lỗi khi xác nhận xuất kho: ", error);
      alert('Đã xảy ra lỗi khi xác nhận.');
    }
  };

  const handleCancelSlip = async (slip) => {
    if (!window.confirm(`Bạn có chắc muốn HỦY phiếu xuất của khách hàng "${slip.customer}" không?`)) {
      return;
    }
    try {
      const slipRef = doc(db, 'export_tickets', slip.id);
      await updateDoc(slipRef, { status: 'cancelled' });
      alert('Hủy phiếu xuất thành công!');
      fetchExportSlips();
    } catch (error) {
      console.error("Lỗi khi hủy phiếu: ", error);
      alert('Đã xảy ra lỗi khi hủy phiếu.');
    }
  };

  const openViewModal = (slip) => {
    setSelectedSlip(slip);
    setIsViewModalOpen(true);
  };

  // BƯỚC 3: THÊM CÁC HÀM ĐỂ MỞ MODAL SỬA VÀ LƯU THAY ĐỔI
  const openEditModal = (slip) => {
    setSelectedSlip(slip);
    setIsEditModalOpen(true);
  };
  
  const handleSaveSlipChanges = async (updatedSlip) => {
    try {
      const slipDocRef = doc(db, "export_tickets", updatedSlip.id);
      // Chỉ cập nhật những trường có thể thay đổi, ví dụ: items, customer, description
      await updateDoc(slipDocRef, { 
          items: updatedSlip.items,
          customer: updatedSlip.customer,
          description: updatedSlip.description
      });
      setIsEditModalOpen(false);
      fetchExportSlips();
      alert('Cập nhật phiếu xuất thành công!');
    } catch (error) {
      console.error("Lỗi khi cập nhật phiếu xuất: ", error);
      alert('Đã xảy ra lỗi khi cập nhật.');
    }
  };

  const renderStatusBadge = (status) => {
    let text = status;
    switch (status) {
        case 'pending': text = 'Đang soạn hàng'; break;
        case 'completed': text = 'Hoàn thành'; break;
        case 'cancelled': text = 'Đã hủy'; break;
        default: text = status;
    }
    return <span className={`status-badge status-${status}`}>{text}</span>;
  };

  if (loading) {
    return <div>Đang tải danh sách phiếu xuất...</div>;
  }

  return (
    <div>
      {/* Thêm Modal Sửa vào giao diện */}
      {isEditModalOpen && (
        <EditExportSlipModal 
            slip={selectedSlip}
            onClose={() => setIsEditModalOpen(false)}
            onSave={handleSaveSlipChanges}
        />
      )}

      {isViewModalOpen && (
        <ViewExportSlipModal 
            slip={selectedSlip}
            onClose={() => setIsViewModalOpen(false)}
        />
      )}
      
      <div className="page-header">
        <h1>Danh sách Phiếu Xuất Kho</h1>
      </div>
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
                <td>{renderStatusBadge(slip.status)}</td>
                <td>
                  <div className="action-buttons">
                    <button className="btn-icon btn-view" title="Xem chi tiết" onClick={() => openViewModal(slip)}>
                        <FiEye />
                    </button>
                    {slip.status === 'pending' && (
                      <>
                        <button className="btn-icon btn-confirm" title="Xác nhận xuất kho" onClick={() => handleConfirmExport(slip)}>
                            <FiCheckCircle />
                        </button>
                        {/* BƯỚC 4: THAY ĐỔI ONCLICK CỦA NÚT SỬA */}
                        <button className="btn-icon btn-edit" title="Sửa phiếu" onClick={() => openEditModal(slip)}>
                            <FiEdit />
                        </button>
                        <button className="btn-icon btn-delete" title="Hủy phiếu" onClick={() => handleCancelSlip(slip)}>
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
    </div>
  );
};

export default ExportListPage;