// src/components/CreateStocktakeModal.jsx
import React, { useState } from 'react';
import { toast } from 'react-toastify';

// *** PHIÊN BẢN SỬA LỖI ***
const CreateStocktakeModal = ({ onClose, onCreate, isCreating }) => {
    const [sessionName, setSessionName] = useState('');
    const [scope, setScope] = useState('all');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!sessionName) {
            toast.warn('Vui lòng đặt tên cho phiên kiểm kê.');
            return;
        }
        onCreate({ sessionName, scope });
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <h2>Tạo Phiên Kiểm Kê Mới</h2>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label>Tên Phiên Kiểm Kê</label>
                        <input
                            type="text"
                            value={sessionName}
                            onChange={(e) => setSessionName(e.target.value)}
                            placeholder="Ví dụ: Kiểm kê cuối năm 2025"
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label>Phạm vi kiểm kê</label>
                        <select value={scope} onChange={(e) => setScope(e.target.value)}>
                            <option value="all">Toàn bộ kho</option>
                            <option value="MED">Chỉ Team MED</option>
                            <option value="BIO">Chỉ Team BIO</option>
                            <option value="Spare Part">Chỉ Team Spare Part</option>
                        </select>
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary" disabled={isCreating}>Hủy</button>
                        <button type="submit" className="btn-primary" disabled={isCreating}>
                            {isCreating ? 'Đang tạo...' : 'Bắt đầu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateStocktakeModal;