// src/components/DateRangePresets.jsx
import React from 'react';

// === BẮT ĐẦU SỬA LỖI TẠI ĐÂY ===
/**
 * Định dạng đối tượng Date thành chuỗi YYYY-MM-DD an toàn với múi giờ.
 * Hàm này sẽ lấy các thành phần (năm, tháng, ngày) dựa trên giờ địa phương,
 * tránh lỗi bị lùi ngày do chuyển đổi sang UTC.
 */
const formatDateForInput = (date) => {
    if (date instanceof Date && !isNaN(date)) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
    // Trả về chuỗi rỗng nếu ngày không hợp lệ để tránh lỗi
    return ''; 
};
// === KẾT THÚC SỬA LỖI ===

const DateRangePresets = ({ onPresetSelect }) => {

    const presets = {
        'Hôm nay': () => {
            const today = new Date();
            const todayStr = formatDateForInput(today); // <-- SỬ DỤNG HÀM MỚI
            onPresetSelect(todayStr, todayStr);
        },
        '7 ngày qua': () => {
            const today = new Date();
            const endDate = formatDateForInput(today); // <-- SỬ DỤNG HÀM MỚI
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(today.getDate() - 6);
            const startDate = formatDateForInput(sevenDaysAgo); // <-- SỬ DỤNG HÀM MỚI
            onPresetSelect(startDate, endDate);
        },
        'Tháng này': () => {
            const today = new Date();
            const startDate = formatDateForInput(new Date(today.getFullYear(), today.getMonth(), 1)); // <-- SỬ DỤNG HÀM MỚI
            const endDate = formatDateForInput(today); // <-- SỬ DỤNG HÀM MỚI
            onPresetSelect(startDate, endDate);
        },
        'Tháng trước': () => {
            const today = new Date();
            const prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            const startDate = formatDateForInput(prevMonth); // <-- SỬ DỤNG HÀM MỚI
            const endDate = formatDateForInput(new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0)); // <-- SỬ DỤNG HÀM MỚI
            onPresetSelect(startDate, endDate);
        },
        'Năm nay': () => {
            const today = new Date();
            const startDate = formatDateForInput(new Date(today.getFullYear(), 0, 1)); // <-- SỬ DỤNG HÀM MỚI
            const endDate = formatDateForInput(today); // <-- SỬ DỤNG HÀM MỚI
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