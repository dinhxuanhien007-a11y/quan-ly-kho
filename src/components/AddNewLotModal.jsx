// src/components/AddNewLotModal.jsx
import React, { useState, useRef } from 'react';
import { formatExpiryDate, parseDateString } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import { z } from 'zod';

const newLotSchema = z.object({
    expiryDate: z.string().refine(val => val.trim() === '' || 
    parseDateString(val) !== null, {
        message: "Hạn Sử Dụng không hợp lệ (cần định dạng dd/mm/yyyy)."
    })
});

const AddNewLotModal = ({ productId, productName, lotNumber, onClose, onSave }) => {
    const [expiryDate, setExpiryDate] = useState('');
    const confirmButtonRef = useRef(null);

    const handleSave = () => {
        // --- THAY ĐỔI 1: Đảm bảo dữ liệu được định dạng trước khi lưu ---
        const finalFormattedValue = formatExpiryDate(expiryDate);
        
        const validationResult = newLotSchema.safeParse({ expiryDate: finalFormattedValue });
        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
            setExpiryDate(finalFormattedValue); // Cập nhật UI với định dạng đúng nếu có lỗi
            return;
        }
        
        onSave(finalFormattedValue);
        onClose();
    };

    // --- THAY ĐỔI 2: Tạo hàm xử lý định dạng chung ---
    const handleFormatting = (value) => {
        const formattedValue = formatExpiryDate(value);
        setExpiryDate(formattedValue);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault(); 
            // Định dạng giá trị hiện tại trong ô input
            handleFormatting(e.target.value);
            // Di chuyển con trỏ đến nút "Xác nhận"
            if (confirmButtonRef.current) {
                confirmButtonRef.current.focus();
            }
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
                    <label>Hạn Sử Dụng (dd/mm/yyyy)</label>
                    <input
                        type="text"
                        value={expiryDate}
                        // --- THAY ĐỔI 3: Trả onChange về trạng thái đơn giản ---
                        onChange={(e) => setExpiryDate(e.target.value)}
                        // Thêm lại onBlur để định dạng khi rời khỏi ô
                        onBlur={(e) => handleFormatting(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Nhập HSD cho lô mới..."
                        autoFocus
                    />
                </div>
                
                <div className="modal-actions">
                    <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
                    <button 
                        ref={confirmButtonRef}
                        type="button" 
                        onClick={handleSave} 
                        className="btn-primary"
                    >
                        Xác nhận
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddNewLotModal;
