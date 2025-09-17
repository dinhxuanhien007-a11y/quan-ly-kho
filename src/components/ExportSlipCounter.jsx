// src/components/ExportSlipCounter.jsx

import React from 'react';
import useExportSlipStore from '../stores/exportSlipStore';

const ExportSlipCounter = () => {
    // Component này chỉ "đăng ký" lắng nghe sự thay đổi của `items`
    const items = useExportSlipStore(state => state.items);
    
    // Chỉ lấy những item đã có thông tin
    const itemCount = items.filter(item => item.productId).length;

    if (itemCount === 0) {
        return null; // Không hiển thị gì nếu chưa có item nào
    }
    
    return (
        <span style={{ 
            marginLeft: '15px', 
            padding: '5px 10px', 
            backgroundColor: '#007bff', 
            color: 'white', 
            borderRadius: '15px',
            fontSize: '12px',
            fontWeight: 'bold'
        }}>
            Phiếu xuất: {itemCount} mặt hàng
        </span>
    );
};

export default ExportSlipCounter;