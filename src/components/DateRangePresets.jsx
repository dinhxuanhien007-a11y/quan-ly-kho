// src/components/DateRangePresets.jsx
import React from 'react';

// THAY ĐỔI 1: Cải thiện hàm formatDate để an toàn hơn
// Hàm này sẽ kiểm tra ngày có hợp lệ không trước khi định dạng
const formatDate = (date) => {
    // Kiểm tra xem date có phải là một đối tượng Date hợp lệ không
    if (date instanceof Date && !isNaN(date)) {
        return date.toISOString().split('T')[0];
    }
    // Trả về chuỗi rỗng nếu ngày không hợp lệ để tránh lỗi
    return ''; 
};

const DateRangePresets = ({ onPresetSelect }) => {
    
    // THAY ĐỔI 2: Xóa 'const today = new Date();' khỏi đây

    const presets = {
        'Hôm nay': () => {
            // Luôn tạo một đối tượng Date mới trong mỗi hàm
            const today = new Date();
            const todayStr = formatDate(today);
            onPresetSelect(todayStr, todayStr);
        },
        '7 ngày qua': () => {
            const today = new Date();
            const endDate = formatDate(today);
            // Tạo một đối tượng Date khác để tính toán, không làm thay đổi 'today'
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 6);
            const startDate = formatDate(sevenDaysAgo);
            onPresetSelect(startDate, endDate);
        },
        'Tháng này': () => {
            const today = new Date();
            const startDate = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
            const endDate = formatDate(today);
            onPresetSelect(startDate, endDate);
        },
        'Tháng trước': () => {
            const today = new Date();
            const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const startDate = formatDate(prevMonth);
            const endDate = formatDate(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0));
            onPresetSelect(startDate, endDate);
        },
        'Năm nay': () => {
            const today = new Date();
            const startDate = formatDate(new Date(today.getFullYear(), 0, 1));
            const endDate = formatDate(today);
            onPresetSelect(startDate, endDate);
        }
    };

    return (
        <div className="filter-group" style={{ marginBottom: '15px' }}>
            {Object.keys(presets).map(name => (
                <button
                    key={name}
                    type="button"
                    className="btn-secondary"
                    onClick={presets[name]}
                    style={{ padding: '8px 12px', width: 'auto' }}
                >
                    {name}
                </button>
            ))}
        </div>
    );
};

export default DateRangePresets;