// src/components/AddNewLotModal.jsx
import React, { useState } from 'react';
import { formatExpiryDate, parseDateString } from '../utils/dateUtils';
import { toast } from 'react-toastify';
import { z } from 'zod';

// --- BẮT ĐẦU THAY ĐỔI 1: Cập nhật Schema Validation ---
// Cho phép chuỗi rỗng, chỉ validate khi có giá trị
const newLotSchema = z.object({
    expiryDate: z.string().refine(val => val.trim() === '' || parseDateString(val) !== null, {
        message: "Hạn Sử Dụng không hợp lệ (cần định dạng dd/mm/yyyy)."
    })
});
// --- KẾT THÚC THAY ĐỔI 1 ---

const AddNewLotModal = ({ productId, productName, lotNumber, onClose, onSave }) => {
    const [expiryDate, setExpiryDate] = useState('');

    const handleSave = () => {
        const validationResult = newLotSchema.safeParse({ expiryDate });
        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
            return;
        }
        
        // Chuyển chuỗi rỗng về cho component cha xử lý
        onSave(expiryDate);
        onClose();
    };

    const handleExpiryDateBlur = (e) => {
        setExpiryDate(formatExpiryDate(e.target.value));
    };

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
                    {/* --- BẮT ĐẦU THAY ĐỔI 2: Bỏ dấu (*) ở nhãn --- */}
                    <label>Hạn Sử Dụng (dd/mm/yyyy)</label>
                    {/* --- KẾT THÚC THAY ĐỔI 2 --- */}
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