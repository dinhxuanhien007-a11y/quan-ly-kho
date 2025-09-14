// src/components/EditExportSlipModal.jsx

import React, { useState } from 'react';
import { FiXCircle } from 'react-icons/fi';
import { toast } from 'react-toastify'; // Import toast

const EditExportSlipModal = ({ slip, onClose, onSave }) => {
  const [slipData, setSlipData] = useState({ ...slip });

  // *** PHIÊN BẢN SỬA LỖI ***
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...slipData.items];
    if (field === 'quantityToExport') {
      const numericValue = Number(value);
      // Lượng xuất ban đầu trên phiếu khi chưa sửa
      const originalExportedQty = slip.items[index].quantityToExport || slip.items[index].quantityExported;
      // Lượng tồn kho khả dụng = lượng còn lại trong kho + lượng đã khai báo xuất ban đầu
      const availableStock = updatedItems[index].quantityRemaining + originalExportedQty;
      
      if (numericValue < 0) return; // Chặn số âm
      
      // Kiểm tra với lượng tồn kho khả dụng
      if (numericValue > availableStock) {
        toast.warn(`Số lượng xuất (${numericValue}) không thể vượt quá tồn kho hiện có (${availableStock}).`);
        updatedItems[index][field] = availableStock;
      } else {
        updatedItems[index][field] = numericValue;
      }
    } else {
      updatedItems[index][field] = value;
    }
    
    setSlipData({ ...slipData, items: updatedItems });
  };

  const removeRow = (indexToRemove) => {
    const newItems = slipData.items.filter((_, index) => index !== indexToRemove);
    setSlipData({ ...slipData, items: newItems });
  };

  const handleSaveChanges = () => {
    const finalSlipData = {
        ...slipData,
        items: slipData.items.filter(item => item.productId && Number(item.quantityToExport) > 0)
    };
    onSave(finalSlipData);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ width: '90vw', maxWidth: '1200px' }}>
        <h2>Chỉnh sửa Phiếu Xuất Kho (ID: {slipData.id})</h2>

        <h3>Chi tiết hàng hóa</h3>
        <div className="item-details-grid" style={{ gridTemplateColumns: '1.5fr 2.5fr 1.5fr 0.8fr 1.5fr 1fr 1.5fr 0.5fr' }}>
          <div className="grid-header">Mã hàng</div>
          <div className="grid-header">Tên hàng</div>
          <div className="grid-header">Số lô</div>
          <div className="grid-header">ĐVT</div>
          <div className="grid-header">Quy cách</div>
          <div className="grid-header">SL Xuất</div>
          <div className="grid-header">Ghi chú</div>
          <div className="grid-header">Thao tác</div>

          {slipData.items.map((item, index) => (
            <React.Fragment key={item.id || index}>
              <div className="grid-cell"><input type="text" value={item.productId} readOnly title="Không thể sửa Mã hàng ở đây" /></div>
              <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
              <div className="grid-cell"><input type="text" value={item.lotNumber} readOnly title="Không thể sửa Lô hàng ở đây" /></div>
              <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
              <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
              <div className="grid-cell">
                <input 
                  type="number" 
                  value={item.quantityToExport} 
                  onChange={e => handleItemChange(index, 'quantityToExport', e.target.value)} 
                />
              </div>
              <div className="grid-cell"><textarea value={item.notes} onChange={e => handleItemChange(index, 'notes', e.target.value)} /></div>
              <div className="grid-cell">
                <button type="button" className="btn-icon btn-delete" onClick={() => removeRow(index)}>
                  <FiXCircle />
                </button>
              </div>
            </React.Fragment>
          ))}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary">Đóng</button>
          <button type="button" onClick={handleSaveChanges} className="btn-primary">Lưu thay đổi</button>
        </div>
      </div>
    </div>
  );
};

export default EditExportSlipModal;