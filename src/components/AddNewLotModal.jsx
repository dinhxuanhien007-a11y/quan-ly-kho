// src/components/AddNewLotModal.jsx
import React, { useState } from 'react';
import { formatExpiryDate } from '../utils/dateUtils';

const AddNewLotModal = ({ productId, productName, lotNumber, onClose, onSave }) => {
    const [expiryDate, setExpiryDate] = useState('');

    const handleSave = () => {
        // Kiểm tra HSD hợp lệ trước khi lưu
        if (!expiryDate || expiryDate.length < 10) {
            alert('Vui lòng nhập Hạn Sử Dụng hợp lệ (dd/mm/yyyy).');
            return;
        }
        onSave(expiryDate);
    };

    const handleExpiryDateBlur = (e) => {
        setExpiryDate(formatExpiryDate(e.target.value));
    };
    
    // Xử lý nhấn Enter để lưu
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content" style={{ width: '450px' }}>
                <h2>Khai Báo Lô Hàng Mới</h2>
                <div className="form-group">
                    <label>Mã hàng</label>
                    <input type="text" value={`${productId} - ${productName}`} readOnly disabled />
                </div>
                <div className="form-group">
                    <label>Số lô mới</label>
                    <input type="text" value={lotNumber} readOnly disabled />
                </div>
                <div className="form-group">
                    <label>Hạn Sử Dụng (dd/mm/yyyy) (*)</label>
                    <input
                        type="text"
                        value={expiryDate}
                        onChange={(e) => setExpiryDate(e.target.value)}
                        onBlur={handleExpiryDateBlur}
                        onKeyDown={handleKeyDown}
                        placeholder="Nhập HSD cho lô mới..."
                        autoFocus
                    />
                </div>
                <div className="modal-actions">
                    <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
                    <button type="button" onClick={handleSave} className="btn-primary">Xác nhận</button>
                </div>
            </div>
        </div>
    );
};

export default AddNewLotModal;