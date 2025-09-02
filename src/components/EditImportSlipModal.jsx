// src/components/EditImportSlipModal.jsx

import React, { useState } from 'react';
import { FiPlusCircle, FiXCircle } from 'react-icons/fi';

const EditImportSlipModal = ({ slip, onClose, onSave }) => {
  const [slipData, setSlipData] = useState({ ...slip });

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...slipData.items];
    updatedItems[index][field] = value;
    setSlipData({ ...slipData, items: updatedItems });
  };

  const addNewRow = () => {
    const newItems = [
      ...slipData.items,
      {
        id: Date.now(),
        productId: '', productName: '', lotNumber: '', expiryDate: '',
        unit: '', packaging: '', quantity: '', notes: '', storageTemp: '', team: ''
      }
    ];
    setSlipData({ ...slipData, items: newItems });
  };

  const removeRow = (indexToRemove) => {
    const newItems = slipData.items.filter((_, index) => index !== indexToRemove);
    setSlipData({ ...slipData, items: newItems });
  };

  const handleSaveChanges = () => {
    onSave(slipData);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ width: '90vw', maxWidth: '1200px' }}>
        <h2>Chỉnh sửa Phiếu Nhập Kho (ID: {slipData.id})</h2>

        <h3>Chi tiết hàng hóa</h3>
        {/* SỬ DỤNG LẠI LAYOUT GRID ĐẦY ĐỦ */}
        <div className="item-details-grid" style={{ gridTemplateColumns: '1fr 2fr 1fr 1.2fr 0.8fr 1.5fr 1fr 1.5fr 0.5fr' }}>
          {/* Tiêu đề Grid */}
          <div className="grid-header">Mã hàng</div>
          <div className="grid-header">Tên hàng</div>
          <div className="grid-header">Số lô</div>
          <div className="grid-header">HSD</div>
          <div className="grid-header">ĐVT</div>
          <div className="grid-header">Quy cách</div>
          <div className="grid-header">Số lượng</div>
          <div className="grid-header">Ghi chú</div>
          <div className="grid-header">Thao tác</div>

          {/* Lặp qua danh sách hàng hóa và hiển thị trong các ô input */}
          {slipData.items.map((item, index) => (
            <React.Fragment key={index}>
              <div className="grid-cell"><input type="text" value={item.productId} onChange={e => handleItemChange(index, 'productId', e.target.value)} /></div>
              <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
              <div className="grid-cell"><input type="text" value={item.lotNumber} onChange={e => handleItemChange(index, 'lotNumber', e.target.value)} /></div>
              <div className="grid-cell"><input type="text" placeholder="dd/mm/yyyy" value={item.expiryDate} onChange={e => handleItemChange(index, 'expiryDate', e.target.value)} /></div>
              <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
              <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
              <div className="grid-cell"><input type="number" value={item.quantity} onChange={e => handleItemChange(index, 'quantity', e.target.value)} /></div>
              <div className="grid-cell"><textarea value={item.notes} onChange={e => handleItemChange(index, 'notes', e.target.value)} /></div>
              <div className="grid-cell">
                <button type="button" className="btn-icon btn-delete" onClick={() => removeRow(index)}>
                  <FiXCircle />
                </button>
              </div>
            </React.Fragment>
          ))}
        </div>

        <button type="button" onClick={addNewRow} className="btn-secondary" style={{ marginTop: '10px' }}>
          <FiPlusCircle style={{ marginRight: '5px' }} />
          Thêm dòng
        </button>

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary">Đóng</button>
          <button type="button" onClick={handleSaveChanges} className="btn-primary">Lưu thay đổi</button>
        </div>
      </div>
    </div>
  );
};

export default EditImportSlipModal;