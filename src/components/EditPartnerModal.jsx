// src/components/EditPartnerModal.jsx

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { z } from 'zod'; // <-- IMPORT ZOD
import { updatePartner } from '../services/partnerService';

// <-- ĐỊNH NGHĨA SCHEMA -->
const partnerSchema = z.object({
  partnerName: z.string().trim().min(1, { message: "Tên Đối tác không được để trống." }),
  partnerType: z.enum(['supplier', 'customer']),
});


const EditPartnerModal = ({ onClose, onPartnerUpdated, partnerToEdit }) => {
    const [partnerData, setPartnerData] = useState({ ...partnerToEdit });
    const [isSaving, setIsSaving] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setPartnerData(prevData => ({ ...prevData, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // <-- SỬ DỤNG SCHEMA ĐỂ XÁC THỰC -->
        const validationResult = partnerSchema.safeParse({
            partnerName: partnerData.partnerName,
            partnerType: partnerData.partnerType,
        });

        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
            return;
        }

        setIsSaving(true);
        try {
            // Gửi dữ liệu đã được validate lên service
            await updatePartner(partnerToEdit.id, validationResult.data);
            
            toast.success('Cập nhật thông tin đối tác thành công!');
            onPartnerUpdated();
        } catch (error) {
            console.error("Lỗi khi cập nhật đối tác: ", error);
            toast.error('Đã xảy ra lỗi khi cập nhật.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Sửa Thông Tin Đối Tác</h2>
                <p><strong>Mã Đối Tác:</strong> {partnerToEdit.id}</p>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Tên Đối Tác (*)</label>
                        <input type="text" name="partnerName" value={partnerData.partnerName || ''} onChange={handleChange} required autoFocus />
                    </div>
                    <div className="form-group">
                        <label>Phân Loại</label>
                        <select name="partnerType" value={partnerData.partnerType} onChange={handleChange}>
                            <option value="supplier">Nhà Cung Cấp</option>
                            <option value="customer">Khách Hàng</option>
                        </select>
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
                        <button type="submit" className="btn-primary" disabled={isSaving}>
                            {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditPartnerModal;