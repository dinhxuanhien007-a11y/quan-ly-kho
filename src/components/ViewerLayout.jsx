// src/components/ViewerLayout.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';
import InventorySummaryPage from '../pages/InventorySummaryPage';
import { useAuth } from '../hooks/useAuth';
import { useResponsive } from '../hooks/useResponsive';
import FloatingCalculator from './FloatingCalculator';
import { MdCalculate } from 'react-icons/md';
// THÊM: Import component mới cho mobile
import MobileInventoryPage from '../pages/MobileInventoryPage'; 

const ViewerLayout = () => {
  const { role: userRole } = useAuth();
  const isMobile = useResponsive(); // Dùng hook để kiểm tra màn hình
  const canViewDetail = userRole === 'admin' || userRole === 'owner';
  const [viewMode, setViewMode] = useState('summary');
  const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);
  const toggleCalculator = () => {
    setIsCalculatorVisible(prev => !prev);
  };
  const dynamicTitle = useMemo(() => {
    switch (userRole) {
      case 'owner':
      case 'admin':
        return 'Kho - PT Biomed';
      case 'med':
        return 'PT Biomed - Team Med';
      case 'bio':
        return 'PT Biomed - Team Bio';
      default:
        return 'Kho PT Biomed';
    }
  }, [userRole]);
  useEffect(() => {
    document.title = dynamicTitle;
  }, [dynamicTitle]);
  useEffect(() => {
    if (!canViewDetail) {
      setViewMode('summary');
    }
  }, [canViewDetail]);

  // THAY ĐỔI: Sử dụng component riêng cho di động
  if (isMobile) {
    return (
      <div style={{ padding: '10px' }}>
        <MobileInventoryPage />
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      {userRole === 'owner' && (
        <div style={{ marginBottom: '20px' }}>
            <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
                &larr; Quay lại Trang Quản Trị
            </Link>
        </div>
      )}

      {canViewDetail && (
        <div className="view-toggle" style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
          <button onClick={() => setViewMode('summary')} className={viewMode === 'summary' ? 'btn-primary' : 'btn-secondary'} style={{width: 'auto'}}>
            Xem Tổng Hợp
          </button>
          <button onClick={() => setViewMode('detail')} className={viewMode === 'detail' ? 'btn-primary' : 'btn-secondary'} style={{width: 'auto'}}>
            Xem Chi Tiết
          </button>
        </div>
      )}

      {(viewMode === 'detail' && canViewDetail) 
        ? <InventoryPage pageTitle={dynamicTitle} /> 
        : <InventorySummaryPage pageTitle={dynamicTitle} />
      }

      <button 
        className="floating-toggle-btn" 
        onClick={toggleCalculator}
        title="Mở máy tính (Có thể dùng bàn phím)"
      >
        <MdCalculate />
      </button>

      {isCalculatorVisible && <FloatingCalculator onClose={toggleCalculator} />}
    </div>
  );
};

export default ViewerLayout;