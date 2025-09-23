// src/components/EditImportSlipModal.jsx
import React, { useState, useRef, useEffect } from 'react';
import { FiPlusCircle, FiXCircle } from 'react-icons/fi';
import { formatExpiryDate, parseDateString } from '../utils/dateUtils';
import { toast } from 'react-toastify'; 
import { z } from 'zod'; // <-- IMPORT ZOD

// <-- ĐỊNH NGHĨA SCHEMA XÁC THỰC -->
const importItemSchema = z.object({
  productId: z.string().trim().min(1, { message: "Mã hàng không được để trống." }),
  productName: z.string(), // Tên hàng là readOnly nên không cần check
  lotNumber: z.string().nullable(), // SỬA LẠI: Cho phép Số lô là null
  expiryDate: z.string().refine(val => { // SỬA LẠI: Logic giống hệt trang Tạo mới
      const trimmedVal = val.trim();
      return trimmedVal === '' || trimmedVal.toUpperCase() === 'N/A' || parseDateString(trimmedVal) !== null;
  }, {
      message: "HSD không hợp lệ (cần là dd/mm/yyyy hoặc để trống)."
  }),
  quantity: z.preprocess(
      val => Number(String(val).trim()), // Chuyển đổi giá trị sang số
      z.number({ invalid_type_error: "Số lượng phải là một con số." })
       .gt(0, { message: "Số lượng phải lớn hơn 0." })
  ),
  // Các trường khác là tùy chọn hoặc readOnly
  unit: z.string().optional(),
  packaging: z.string().optional(),
  notes: z.string().optional(),
  storageTemp: z.string().optional(),
  team: z.string().optional(),
});

const importSlipSchema = z.object({
    items: z.array(importItemSchema).min(1, { message: "Phiếu nhập phải có ít nhất một mặt hàng hợp lệ." })
});


const EditImportSlipModal = ({ slip, onClose, onSave }) => {
  const [slipData, setSlipData] = useState({ ...slip });

  // === BẮT ĐẦU THÊM MỚI ===
    const dateToInputValue = (dateStr) => {
        if (!dateStr || dateStr.split('/').length !== 3) return '';
        const [day, month, year] = dateStr.split('/');
        return `${year}-${month}-${day}`;
    };

    const handleInfoChange = (field, value) => {
        let finalValue = value;
        if (field === 'importDate') {
            const [year, month, day] = value.split('-');
            finalValue = `${day}/${month}/${year}`;
        }
        setSlipData(prev => ({ ...prev, [field]: finalValue }));
    };
    // === KẾT THÚC THÊM MỚI ===

  const lastInputRef = useRef(null);

  useEffect(() => {
    if (lastInputRef.current) {
        lastInputRef.current.focus();
    }
  }, [slipData.items.length]);

  const handleExpiryDateBlur = (index, value) => {
    const updatedItems = [...slipData.items];
    updatedItems[index].expiryDate = formatExpiryDate(value);
    setSlipData({ ...slipData, items: updatedItems });
  };

  const handleItemChange = (index, field, value) => {
    const updatedItems = [...slipData.items];
    // Đảm bảo giá trị là một số hợp lệ trước khi gán
    if (field === 'quantity') {
        const numericValue = Number(value);
        updatedItems[index][field] = isNaN(numericValue) ? '' : value;
    } else {
        updatedItems[index][field] = value;
    }
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
    // <-- SỬ DỤNG SCHEMA ĐỂ XÁC THỰC -->
    // THÊM BƯỚC MAP ĐỂ CHUẨN HÓA DỮ LIỆU TRƯỚC KHI VALIDATE
    const itemsToValidate = slipData.items
        .filter(item => item.productId)
        .map(item => ({
            ...item,
            lotNumber: item.lotNumber ? item.lotNumber.trim() : null
        }));

    const validationResult = importSlipSchema.safeParse({ items: itemsToValidate });

    if (!validationResult.success) {
        const firstError = validationResult.error.issues[0];
        const errorPath = firstError.path; // ví dụ: ['items', 0, 'lotNumber']
        const errorIndex = errorPath[1];
        const errorMessage = `Lỗi ở Dòng ${errorIndex + 1}: ${firstError.message}`;
        
        toast.warn(errorMessage);
        return;
    }

    // Nếu hợp lệ, chỉ gửi đi dữ liệu đã được validate
    onSave({ ...slipData, items: validationResult.data.items });
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content" style={{ width: '90vw', maxWidth: '1200px' }}>
        <h2>Chỉnh sửa Phiếu Nhập Kho (ID: {slipData.id})</h2>
        {/* === BẮT ĐẦU THÊM MỚI === */}
            <div className="form-section" style={{padding: '15px', marginTop: '10px'}}>
                <div className="form-row">
                    <div className="form-group">
                        <label>Ngày nhập (*)</label>
                        <input 
                            type="date"
                            value={dateToInputValue(slipData.importDate)}
                            onChange={(e) => handleInfoChange('importDate', e.target.value)}
                            min={new Date().toISOString().split('T')[0]} // Chặn ngày quá khứ
                        />
                    </div>
                    <div className="form-group">
                        <label>Nhà cung cấp</label>
                        <input type="text" value={slipData.supplierName} readOnly disabled />
                    </div>
                    <div className="form-group">
                        <label>Diễn giải</label>
                        <textarea 
                            value={slipData.description} 
                            onChange={(e) => handleInfoChange('description', e.target.value)}
                            rows={1}
                        />
                    </div>
                </div>
            </div>
            {/* === KẾT THÚC THÊM MỚI === */}
        <h3>Chi tiết hàng hóa</h3>
        <div className="item-details-grid" style={{ gridTemplateColumns: '1fr 2fr 1fr 1.2fr 0.8fr 1.5fr 1fr 1.5fr 0.5fr' }}>
          <div className="grid-header">Mã hàng (*)</div>
          <div className="grid-header">Tên hàng</div>
          <div className="grid-header">Số lô (*)</div>
          <div className="grid-header">HSD (*)</div>
          <div className="grid-header">ĐVT</div>
          <div className="grid-header">Quy cách</div>
          <div className="grid-header">Số lượng (*)</div>
          <div className="grid-header">Ghi chú</div>
          <div className="grid-header">Thao tác</div>

          {slipData.items.map((item, index) => (
            <React.Fragment key={index}>
              <div className="grid-cell">
                <input 
                    type="text" 
                    value={item.productId} 
                    onChange={e => handleItemChange(index, 'productId', e.target.value)} 
                    ref={index === slipData.items.length - 1 ? lastInputRef : null}
                />
              </div>
              <div className="grid-cell"><input type="text" value={item.productName} readOnly /></div>
              <div className="grid-cell"><input type="text" value={item.lotNumber} onChange={e => handleItemChange(index, 'lotNumber', e.target.value)} /></div>
              <div className="grid-cell">
                <input 
                    type="text" 
                    placeholder="dd/mm/yyyy" 
                    value={item.expiryDate} 
                    onChange={e => handleItemChange(index, 'expiryDate', e.target.value)} 
                    onBlur={e => handleExpiryDateBlur(index, e.target.value)}
                />
              </div>
              <div className="grid-cell"><input type="text" value={item.unit} readOnly /></div>
              <div className="grid-cell"><textarea value={item.packaging} readOnly /></div>
              <div className="grid-cell">
    <input
        type="text" // THAY ĐỔI: Sử dụng type="text"
        inputMode="numeric" // THÊM: Gợi ý bàn phím số trên di động
        value={item.quantity}
        onChange={e => {
            const value = e.target.value;
            // THAY ĐỔI: Kiểm tra để cho phép cả số nguyên và số thập phân
            if (/^\d*\.?\d*$/.test(value) || value === '') {
                handleItemChange(index, 'quantity', value);
            }
        }}
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