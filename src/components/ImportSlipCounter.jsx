// src/components/ImportSlipCounter.jsx

import React from 'react';
import useImportSlipStore from '../stores/importSlipStore';

const ImportSlipCounter = () => {
    // Component này chỉ "lắng nghe" sự thay đổi của `items` trong store.
    const items = useImportSlipStore(state => state.items);
    
    // Chỉ đếm những item đã có thông tin mã hàng.
    const itemCount = items.filter(item => item.productId && item.productId.trim() !== '').length;

    // Không hiển thị gì nếu chưa có item nào.
    if (itemCount === 0) {
        return null;
    }
    
    return (
        <span style={{ 
            marginLeft: '15px', 
            padding: '5px 10px', 
            backgroundColor: '#28a745', // Màu xanh lá cho phiếu nhập
            color: 'white', 
            borderRadius: '15px',
            fontSize: '12px',
            fontWeight: 'bold'
        }}>
            Phiếu nhập: {itemCount} mặt hàng
        </span>
    );
};

export default ImportSlipCounter;