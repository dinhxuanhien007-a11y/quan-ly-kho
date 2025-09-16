// src/components/EditExportSlipModal.jsx

import React, { useState } from 'react';
import { FiXCircle } from 'react-icons/fi';
import { toast } from 'react-toastify';
import { z } from 'zod'; // <-- IMPORT ZOD

// <-- ĐỊNH NGHĨA SCHEMA XÁC THỰC -->
const exportItemSchema = z.object({
  quantityToExport: z.preprocess(
      val => Number(String(val).trim()),
      z.number({ invalid_type_error: "Số lượng xuất phải là một con số." })
       .gt(0, { message: "Số lượng xuất phải lớn hơn 0." })
  ),
  // Giữ lại các trường khác để có thể truyền nguyên object item vào validate
  // và để thông báo lỗi được rõ ràng hơn
  productId: z.string(),
  lotNumber: z.string(),
});

const EditExportSlipModal = ({ slip, onClose, onSave }) => {
  const [slipData, setSlipData] = useState({ ...slip });

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...slipData.items];
    if (field === 'quantityToExport') {
      const numericValue = Number(value);
      const originalExportedQty = slip.items[index].quantityToExport || slip.items[index].quantityExported;
      const availableStock = updatedItems[index].quantityRemaining + originalExportedQty;
      
      if (numericValue < 0) return; 
      
      if (numericValue > availableStock) {
        toast.warn(`Số lượng xuất (${numericValue}) không thể vượt quá tồn kho hiện có (${availableStock}).`);
        updatedItems[index][field] = availableStock;
      } else {
        updatedItems[index][field] = value;
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
    // Lọc ra các dòng có productId và số lượng > 0 trước khi validate
    const itemsToValidate = slipData.items.filter(item => item.productId && Number(item.quantityToExport) > 0);
    
    if (itemsToValidate.length === 0) {
        toast.warn("Phiếu xuất phải có ít nhất một mặt hàng với số lượng lớn hơn 0.");
        onSave({ ...slipData, items: [] }); // Gửi mảng rỗng để xóa hết
        return;
    }

    // <-- SỬ DỤNG SCHEMA ĐỂ XÁC THỰC -->
    // Dùng .safeParse trên từng item và kiểm tra
    for (let i = 0; i < itemsToValidate.length; i++) {
        const item = itemsToValidate[i];
        const validationResult = exportItemSchema.safeParse(item);
        if (!validationResult.success) {
            // Xác định dòng lỗi dựa trên index trong mảng gốc để thông báo chính xác
            const originalIndex = slipData.items.findIndex(originalItem => originalItem.id === item.id);
            const errorMessage = `Lỗi ở dòng ${originalIndex + 1} (Mã: ${item.productId}): ${validationResult.error.issues[0].message}`;
            toast.warn(errorMessage);
            return;
        }
    }

    const finalSlipData = {
        ...slipData,
        items: itemsToValidate // Chỉ gửi đi những dòng hợp lệ
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
          <div className="grid-header">SL Xuất (*)</div>
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