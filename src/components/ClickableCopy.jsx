// src/components/ClickableCopy.jsx
import React from 'react';
import { toast } from 'react-toastify';
import { FiCopy } from 'react-icons/fi';

const ClickableCopy = ({ text, children }) => {
    const handleCopy = (e) => {
        // Quan trọng: Ngăn không cho sự kiện click lan ra ngoài (tránh kích hoạt mở dòng chi tiết)
        e.stopPropagation(); 

        if (!text) return;
        
        navigator.clipboard.writeText(text).then(() => {
            toast.success(`Đã sao chép: ${text}`, {
                position: "bottom-center",
                autoClose: 1000,
                hideProgressBar: true,
                closeOnClick: true,
                pauseOnHover: false,
                draggable: false,
            });
        }).catch(err => {
            console.error('Lỗi sao chép:', err);
        });
    };

    return (
        <div 
            onClick={handleCopy} 
            style={{ 
                cursor: 'copy', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '5px',
                transition: 'color 0.2s'
            }}
            title="Bấm để sao chép"
            className="clickable-copy-wrapper"
        >
            {children}
            {/* Icon copy mờ, chỉ hiện rõ khi hover (xử lý bằng CSS hoặc để mờ mặc định) */}
            <FiCopy style={{ fontSize: '12px', opacity: 0.4 }} />
        </div>
    );
};

export default ClickableCopy;