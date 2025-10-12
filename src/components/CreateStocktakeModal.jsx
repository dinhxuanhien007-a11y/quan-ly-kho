// src/components/CreateStocktakeModal.jsx
import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { z } from 'zod'; // <-- IMPORT ZOD
import { TEAM_OPTIONS } from '../constants';

// <-- ĐỊNH NGHĨA SCHEMA -->
const stocktakeSchema = z.object({
    sessionName: z.string().trim().min(1, { message: "Vui lòng đặt tên cho phiên kiểm kê." })
});

const CreateStocktakeModal = ({ onClose, onCreate, isCreating }) => {
    const [sessionName, setSessionName] = useState('');
    const [scope, setScope] = useState('all');

    const handleSubmit = (e) => {
        e.preventDefault();
        
        // <-- SỬ DỤNG SCHEMA ĐỂ XÁC THỰC -->
        const validationResult = stocktakeSchema.safeParse({ sessionName });

        if (!validationResult.success) {
            toast.warn(validationResult.error.issues[0].message);
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
                        <label>Tên Phiên Kiểm Kê (*)</label>
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
    {TEAM_OPTIONS.map(team => (
        <option key={team} value={team}>Chỉ Team {team}</option>
    ))}
</select>
                    </div>
                    <div className="modal-actions">
                        <button type="button" onClick={onClose} className="btn-secondary" disabled={isCreating}>Hủy</button>
                        <button type="submit" className="btn-primary" disabled={isCreating}>
                            {isCreating ? 'Đang tạo...' : 'Bắt Đầu'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default CreateStocktakeModal;
