// src/components/EditExportSlipModal.jsx

import React, { useState } from 'react';
import { FiPlusCircle, FiXCircle } from 'react-icons/fi';

const EditExportSlipModal = ({ slip, onClose, onSave }) => {
  // Sao chép dữ liệu của phiếu vào state để chỉnh sửa
  const [slipData, setSlipData] = useState({ ...slip });

  // Xử lý khi thay đổi giá trị trong một dòng hàng
  const handleItemChange = (index, field, value) => {
    const updatedItems = [...slipData.items];
    
    // Đảm bảo số lượng không phải là số âm
    if (field === 'quantityToExport' && Number(value) < 0) {
      return;
    }
    
    updatedItems[index][field] = value;
    setSlipData({ ...slipData, items: updatedItems });
  };

  // Thêm một dòng hàng mới (rỗng)
  const addNewRow = () => {
    const newItems = [
      ...slipData.items,
      {
        // Tạo một ID tạm thời cho key của React
        id: Date.now(),
        productId: '', 
        productName: '(Vui lòng tìm sản phẩm ở trang Tạo Phiếu)', 
        lotNumber: '',
        unit: '', 
        packaging: '', 
        quantityToExport: '', 
        notes: ''
      }
    ];
    setSlipData({ ...slipData, items: newItems });
  };

  // Xóa một dòng hàng
  const removeRow = (indexToRemove) => {
    const newItems = slipData.items.filter((_, index) => index !== indexToRemove);
    setSlipData({ ...slipData, items: newItems });
  };

  // Gọi hàm onSave được truyền từ component cha với dữ liệu đã cập nhật
  const handleSaveChanges = () => {
    // Lọc ra những dòng hàng hợp lệ trước khi lưu
    const finalSlipData = {
        ...slipData,
        items: slipData.items.filter(item => item.productId && item.quantityToExport > 0)
    };
    onSave(finalSlipData);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ width: '90vw', maxWidth: '1200px' }}>
        <h2>Chỉnh sửa Phiếu Xuất Kho (ID: {slipData.id})</h2>

        <h3>Chi tiết hàng hóa</h3>
        {/* Sử dụng lại layout grid tương tự trang Tạo phiếu xuất */}
        <div className="item-details-grid" style={{ gridTemplateColumns: '1.5fr 2.5fr 1.5fr 0.8fr 1.5fr 1fr 1.5fr 0.5fr' }}>
          {/* Tiêu đề Grid */}
          <div className="grid-header">Mã hàng</div>
          <div className="grid-header">Tên hàng</div>
          <div className="grid-header">Số lô</div>
          <div className="grid-header">ĐVT</div>
          <div className="grid-header">Quy cách</div>
          <div className="grid-header">SL Xuất</div>
          <div className="grid-header">Ghi chú</div>
          <div className="grid-header">Thao tác</div>

          {/* Lặp qua danh sách hàng hóa */}
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

        {/* Chức năng thêm dòng hiện không hỗ trợ tìm kiếm sản phẩm, nên tạm ẩn đi */}
        {/* <button type="button" onClick={addNewRow} className="btn-secondary" style={{ marginTop: '10px' }}>
          <FiPlusCircle style={{ marginRight: '5px' }} />
          Thêm dòng
        </button> */}

        <div className="modal-actions">
          <button type="button" onClick={onClose} className="btn-secondary">Đóng</button>
          <button type="button" onClick={handleSaveChanges} className="btn-primary">Lưu thay đổi</button>
        </div>
      </div>
    </div>
  );
};

export default EditExportSlipModal;