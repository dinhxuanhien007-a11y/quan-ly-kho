// src/components/StatusBadge.jsx
import React from 'react';

const StatusBadge = ({ status }) => {
    let text = status;
    let className = `status-badge status-${status}`;

    switch (status) {
        case 'pending':
            text = 'Đang chờ';
            break;
        case 'completed':
            text = 'Hoàn thành';
            break;
        case 'cancelled':
            text = 'Đã hủy';
            break;
        case 'in_progress':
            text = 'Đang thực hiện';
            className = 'status-badge status-pending'; // Tái sử dụng style màu vàng
            break;
        case 'adjusted':
            text = 'Đã điều chỉnh';
            className = 'status-badge status-adjusted'; // Style màu tím mới
            break;
        default:
            text = status;
    }

    return <span className={className}>{text}</span>;
};

export default StatusBadge;