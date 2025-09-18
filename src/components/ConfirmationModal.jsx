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
    confirmButtonType = 'primary'
}) => {
    if (!isOpen) return null;

    // Ghi log để kiểm tra xem hàm onConfirm có được truyền đúng cách không
    console.log('ConfirmationModal đang render. Hàm onConfirm là:', onConfirm);

    const confirmClassName = `btn-${confirmButtonType}`;

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
                    <button type="button" onClick={onCancel} className="btn-secondary">{cancelText}</button>
                    <button type="button" onClick={onConfirm} className={confirmClassName}>
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default React.memo(ConfirmationModal);