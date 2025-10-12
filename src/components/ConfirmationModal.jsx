// src/components/ConfirmationModal.jsx

import React from 'react';
import { FiAlertTriangle } from 'react-icons/fi';

const ConfirmationModal = ({ 
    isOpen, 
    title, 
    message, 
    onConfirm, 
    onCancel, 
    confirmText = 'Xác nhận', 
    cancelText = 'Hủy', 
    isConfirming = false // Thêm prop mới với giá trị mặc định là false
}) => {
    if (!isOpen) return null;

    return (
        <div className="modal-backdrop">
             <div className="modal-content" style={{ width: '450px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ color: '#f59e0b', fontSize: '32px' }}>
                          <FiAlertTriangle />
                    </div>
                    <div>
                        <h2 style={{ marginTop: 0, marginBottom: '10px' }}>{title}</h2>
                         <p style={{ margin: 0 }}>{message}</p>
                    </div>
                </div>
                <div className="modal-actions" style={{ marginTop: '25px' }}>
                    {/* Nút Hủy cũng sẽ bị vô hiệu hóa khi đang xử lý */}
                    <button 
                        type="button" 
                        onClick={onCancel} 
                        className="btn-secondary" 
                        disabled={isConfirming}
                    >
                        {cancelText}
                    </button>
                    {/* Nút Xác nhận sẽ thay đổi text và bị vô hiệu hóa */}
                    <button 
                        type="button" 
                        onClick={onConfirm} 
                        className="btn-primary" 
                        style={{ backgroundColor: '#dc3545' }}
                        disabled={isConfirming}
                    >
                        {isConfirming ? 'Đang xử lý...' : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(ConfirmationModal);
