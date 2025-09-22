// src/components/ViewerLayout.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';
import InventorySummaryPage from '../pages/InventorySummaryPage';
import { useAuth } from '../hooks/useAuth';
import { useResponsive } from '../hooks/useResponsive';
import FloatingCalculator from './FloatingCalculator';
import { MdCalculate } from 'react-icons/md';

const ViewerLayout = () => {
  const { role: userRole } = useAuth();
  const isMobile = useResponsive();
  
  const canViewDetail = userRole === 'admin' || userRole === 'owner';
  const [viewMode, setViewMode] = useState('summary');
  const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);

  // Tạo tiêu đề động dựa trên vai trò của user
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
        return 'Kho PT Biomed'; // Tiêu đề mặc định
    }
  }, [userRole]);

  // Cập nhật tiêu đề tab của trình duyệt
  useEffect(() => {
    document.title = dynamicTitle;
  }, [dynamicTitle]);
  
  // Tự động chuyển về 'summary' nếu user không có quyền
  useEffect(() => {
    if (!canViewDetail) {
      setViewMode('summary');
    }
  }, [canViewDetail]);

  // Giao diện cho di động
  if (isMobile) {
    return (
      <div style={{ padding: '10px' }}>
        {/*
          - Xóa tiêu đề "Sổ Cái Tồn Kho"
          - Truyền tiêu đề động vào component con
        */}
        <InventorySummaryPage pageTitle={dynamicTitle} />
      </div>
    );
  }

  // Giao diện cho máy tính
  return (
    <div style={{ padding: '20px' }}>
      {userRole === 'owner' && (
        <div style={{ marginBottom: '20px' }}>
            <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
                &larr; Quay lại Trang Quản Trị
            </Link>
        </div>
      )}

      {/* Tiêu đề "Sổ Cái Tồn Kho" đã được xóa khỏi đây */}

      {/* Nút chuyển đổi chế độ xem */}
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

      {/* Hiển thị component tương ứng và truyền tiêu đề động vào */}
      {(viewMode === 'detail' && canViewDetail) 
        ? <InventoryPage pageTitle={dynamicTitle} /> 
        : <InventorySummaryPage pageTitle={dynamicTitle} />
      }

      <button 
        className="floating-toggle-btn" 
        onClick={() => setIsCalculatorVisible(true)}
        title="Mở máy tính (Có thể dùng bàn phím)"
      >
        <MdCalculate />
      </button>

      {isCalculatorVisible && <FloatingCalculator onClose={() => setIsCalculatorVisible(false)} />}
    </div>
  );
};

export default ViewerLayout;