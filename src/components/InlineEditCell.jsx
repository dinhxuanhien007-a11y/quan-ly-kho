// src/components/InlineEditCell.jsx
import React, { useState, useEffect, useRef } from 'react';
import { FiEdit, FiCheck, FiX } from 'react-icons/fi'; // <-- THÊM ICON MỚI (nếu chưa có)
import { toast } from 'react-toastify';
import styles from './InlineEditCell.module.css';

// Nhận prop canEdit từ InventoryPage
const InlineEditCell = ({ initialValue, onSave, id, canEdit = false, customStyle = {} }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [value, setValue] = useState(initialValue);
    const inputRef = useRef(null);
    
    // --- STATE MỚI: Quản lý trạng thái hover ---
    const [isHovered, setIsHovered] = useState(false); 
    // ------------------------------------------

    useEffect(() => {
        setValue(initialValue);
    }, [initialValue]);

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isEditing]);

    // --- THAY THẾ handleDoubleClick BẰNG handleClickEdit ---
    const handleClickEdit = (e) => {
        e.stopPropagation(); // Ngăn chọn dòng
        if (canEdit) {
            setIsEditing(true);
        }
    };

    const handleSave = () => {
        setIsEditing(false);
        if (value !== initialValue) {
            onSave(id, value);
        }
    };
    
    // Thêm hàm hủy bỏ chỉnh sửa
    const handleCancel = () => {
        setIsEditing(false);
        setValue(initialValue); // Quay về giá trị cũ
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };

    // THÊM HÀM NÀY VÀO ĐÂY
    const handleChange = (e) => {
        setValue(e.target.value);
    };
    
    // --- Chế độ CHỈNH SỬA (Editing Mode) ---
    if (isEditing) {
    return (
        <div className={styles.editWrapper} onClick={(e) => e.stopPropagation()}>
            <input
                type="text"
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                ref={inputRef}
                className={styles.editInput}
            />
            
            <div className={styles.actionButtons}>
                {/* Thay button text 'Lưu' bằng icon ✓ */}
                <button 
                    onClick={handleSave} 
                    className={styles.saveButton} 
                    title="Lưu (Enter)"
                >
                    ✓
                </button>
                
                {/* Thay button text 'Hủy' bằng icon ✕ */}
                <button 
                    onClick={handleCancel} 
                    className={styles.cancelButton} 
                    title="Hủy (Esc)"
                >
                    ✕
                </button>
            </div>
        </div>
    );
}
    
    // --- Chế độ XEM (Viewing Mode) ---
    return (
        <div 
            onMouseEnter={() => setIsHovered(true)} // Bật trạng thái hover
            onMouseLeave={() => setIsHovered(false)} // Tắt trạng thái hover
            onClick={(e) => e.stopPropagation()} // Ngăn chọn dòng khi click vào nội dung
            title={canEdit ? "Click vào biểu tượng để sửa nhanh" : "Chỉ Owner mới có quyền sửa"}
            style={{ 
                cursor: canEdit ? 'default' : 'default', // Đặt default cursor
                minHeight: '20px', 
                padding: '5px',
                border: '1px solid transparent',
                borderRadius: '4px',
                transition: 'background 0.2s',
                position: 'relative', // Quan trọng: để đặt icon tuyệt đối
                // ---> THÊM DÒNG NÀY ĐỂ ÁP DỤNG STYLE TÙY CHỈNH <---
                ...customStyle
            }}
            className={canEdit ? "inline-edit-cell" : ""}
        >
            {/* 1. HIỂN THỊ NỘI DUNG/TRỐNG */}
            {value ? (
                value
            ) : (
                canEdit ? <span style={{ color: '#ccc', fontStyle: 'italic' }}>(Trống)</span> : null
            )}

            {/* 2. HIỂN THỊ ICON SỬA KHI HOVER VÀ CÓ QUYỀN */}
            {canEdit && isHovered && (
                <button 
                    onClick={handleClickEdit} 
                    title="Sửa ghi chú"
                    style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        right: '5px', // Đặt ở góc trên bên phải
                        transform: 'translateY(-50%)',
                        background: '#e9ecef', 
                        border: '1px solid #ccc',
                        borderRadius: '3px',
                        padding: '2px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <FiEdit size={12} color="#495057" />
                </button>
            )}
        </div>
    );
};

export default InlineEditCell;