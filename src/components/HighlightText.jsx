// src/components/HighlightText.jsx
import React from 'react';

const HighlightText = ({ text = '', highlight = '' }) => {
    // Nếu không có text hoặc không có từ khóa tìm kiếm, trả về text gốc
    if (!highlight || !highlight.trim()) {
        return <span>{text}</span>;
    }
    
    // Chuyển đổi text đầu vào thành chuỗi để tránh lỗi nếu là số
    const strText = String(text);

    // Escape các ký tự đặc biệt trong regex để tránh lỗi (ví dụ dấu +, *, ?)
    const escapeRegExp = (string) => {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    try {
        // Tạo biểu thức chính quy: tìm từ khóa, không phân biệt hoa thường
        const regex = new RegExp(`(${escapeRegExp(highlight.trim())})`, 'gi');
        
        // Tách chuỗi thành các phần dựa trên từ khóa
        const parts = strText.split(regex);

        return (
            <span>
                {parts.map((part, i) => 
                    // Kiểm tra nếu phần này khớp với từ khóa (không phân biệt hoa thường)
                    regex.test(part) ? (
                        <mark key={i} style={{ backgroundColor: '#ffeb3b', color: '#000', fontWeight: 'bold', padding: '0 2px', borderRadius: '2px' }}>
                            {part}
                        </mark>
                    ) : (
                        <span key={i}>{part}</span>
                    )
                )}
            </span>
        );
    } catch (e) {
        // Nếu có lỗi regex (hiếm gặp), trả về text gốc
        return <span>{strText}</span>;
    }
};

export default HighlightText;