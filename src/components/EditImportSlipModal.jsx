// src/components/EditImportSlipModal.jsx
import React, { useState, useRef, useEffect } from 'react'; // <-- THÊM MỚI: import useRef, useEffect
import { FiPlusCircle, FiXCircle } from 'react-icons/fi';
import { formatExpiryDate } from '../utils/dateUtils';

const EditImportSlipModal = ({ slip, onClose, onSave }) => {
  const [slipData, setSlipData] = useState({ ...slip });
  // <-- THÊM MỚI: Ref để tham chiếu đến input cuối cùng
  const lastInputRef = useRef(null);

  // <-- THÊM MỚI: useEffect để focus vào input của dòng mới được thêm
  useEffect(() => {
    if (lastInputRef.current) {
        lastInputRef.current.focus();
    }
  }, [slipData.items.length]); // Chạy mỗi khi số lượng dòng thay đổi


  const handleExpiryDateBlur = (index, value) => {
    const updatedItems = [...slipData.items];
    updatedItems[index].expiryDate = formatExpiryDate(value);
    setSlipData({ ...slipData, items: updatedItems });
  };

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
        <div className="item-details-grid" style={{ gridTemplateColumns: '1fr 2fr 1fr 1.2fr 0.8fr 1.5fr 1fr 1.5fr 0.5fr' }}>
          {/* ... grid headers ... */}
          <div className="grid-header">Mã hàng</div>
          <div className="grid-header">Tên hàng</div>
          <div className="grid-header">Số lô</div>
          <div className="grid-header">HSD</div>
          <div className="grid-header">ĐVT</div>
          <div className="grid-header">Quy cách</div>
          <div className="grid-header">Số lượng</div>
          <div className="grid-header">Ghi chú</div>
          <div className="grid-header">Thao tác</div>

          {slipData.items.map((item, index) => (
            <React.Fragment key={index}>
              <div className="grid-cell">
                <input 
                    type="text" 
                    value={item.productId} 
                    onChange={e => handleItemChange(index, 'productId', e.target.value)} 
                    // <-- THAY ĐỔI: Gán ref cho ô input của dòng cuối cùng
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