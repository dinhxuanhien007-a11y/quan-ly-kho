// src/components/DateRangePresets.jsx
import React from 'react';

// Hàm trợ giúp để định dạng ngày thành chuỗi YYYY-MM-DD
const formatDate = (date) => date.toISOString().split('T')[0];

const DateRangePresets = ({ onPresetSelect }) => {
    const today = new Date();

    const presets = {
        'Hôm nay': () => {
            const todayStr = formatDate(today);
            onPresetSelect(todayStr, todayStr);
        },
        '7 ngày qua': () => {
            const endDate = formatDate(today);
            const startDate = formatDate(new Date(today.setDate(today.getDate() - 6)));
            onPresetSelect(startDate, endDate);
        },
        'Tháng này': () => {
            const startDate = formatDate(new Date(today.getFullYear(), today.getMonth(), 1));
            const endDate = formatDate(new Date());
            onPresetSelect(startDate, endDate);
        },
        'Tháng trước': () => {
            const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const startDate = formatDate(prevMonth);
            const endDate = formatDate(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0));
            onPresetSelect(startDate, endDate);
        },
        'Năm này': () => {
            const startDate = formatDate(new Date(today.getFullYear(), 0, 1));
            const endDate = formatDate(new Date());
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