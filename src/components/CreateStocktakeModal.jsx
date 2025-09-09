// src/components/CreateStocktakeModal.jsx

import React, { useState } from 'react';

const CreateStocktakeModal = ({ onClose, onCreate }) => {
    const [sessionName, setSessionName] = useState('');
    const [scope, setScope] = useState('all'); // Mặc định là toàn bộ kho

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!sessionName) {
            alert('Vui lòng đặt tên cho phiên kiểm kê.');
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
                        <button type="button" onClick={onClose} className="btn-secondary">Hủy</button>
                        <button type="submit" className="btn-primary">Bắt đầu</button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateStocktakeModal;