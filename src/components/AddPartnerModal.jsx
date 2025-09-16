// src/components/AddPartnerModal.jsx

import React, { useState } from 'react';
import { toast } from 'react-toastify';

// Import hàm service thay vì các hàm của firestore
import { addPartner } from '../services/partnerService';

const AddPartnerModal = ({ onClose, onPartnerAdded }) => {
    const [partnerId, setPartnerId] = useState('');
    const [partnerName, setPartnerName] = useState('');
    const [partnerType, setPartnerType] = useState('supplier');
    const [isSaving, setIsSaving] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!partnerId || !partnerName) {
            toast.warn('Mã và Tên đối tác không được để trống.');
            return;
        }
        setIsSaving(true);

        try {
            const newPartnerData = { partnerName, partnerType };
            // Gọi hàm service để thêm đối tác
            await addPartner(partnerId, newPartnerData);

            toast.success('Thêm đối tác mới thành công!');
            onPartnerAdded();
        } catch (error) {
            console.error("Lỗi khi thêm đối tác: ", error);
            toast.error('Đã xảy ra lỗi khi thêm đối tác.');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Thêm Đối Tác Mới</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Mã Đối Tác (ID)</label>
                        <input type="text" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} required autoFocus/>
                    </div>
                    <div className="form-group">
                        <label>Tên Đối Tác</label>
                        <input type="text" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} required />
                    </div>
                    <div className="form-group">
                        <label>Phân Loại</label>
                        <select value={partnerType} onChange={(e) => setPartnerType(e.target.value)}>
                            <option value="supplier">Nhà Cung Cấp</option>
                            <option value="customer">Khách Hàng</option>
                        </select>
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary" disabled={isSaving}>Hủy</button>
                        <button type="submit" className="btn-primary" disabled={isSaving}>
                            {isSaving ? 'Đang lưu...' : 'Lưu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AddPartnerModal;