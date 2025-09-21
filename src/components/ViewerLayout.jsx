// src/components/ViewerLayout.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';
import InventorySummaryPage from '../pages/InventorySummaryPage';
import { useAuth } from '../hooks/useAuth';
import { useResponsive } from '../hooks/useResponsive'; // <-- THÊM DÒNG NÀY
import FloatingCalculator from './FloatingCalculator';
import { MdCalculate } from 'react-icons/md';

const ViewerLayout = () => {
  const { role: userRole } = useAuth();
  const isMobile = useResponsive(); // <-- SỬ DỤNG HOOK MỚI
  
  const canViewDetail = userRole === 'admin' || userRole === 'owner';
  const [viewMode, setViewMode] = useState('summary');
  const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);
  
  const pageTitle = "Sổ Cái Tồn Kho";

  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);
  
  // Tự động chuyển về 'summary' nếu user không có quyền
  useEffect(() => {
    if (!canViewDetail) {
      setViewMode('summary');
    }
  }, [canViewDetail]);

  // --- LOGIC QUAN TRỌNG NHẤT ---
  // Nếu là di động, chỉ hiển thị chế độ tổng hợp
  if (isMobile) {
    return (
      <div style={{ padding: '10px' }}>
        <div className="page-header" style={{ marginBottom: '15px' }}>
          <h1>{pageTitle}</h1>
        </div>
        <InventorySummaryPage />
      </div>
    );
  }

  // --- Giao diện cho máy tính (giữ nguyên như cũ) ---
  return (
    <div style={{ padding: '20px' }}>
      {userRole === 'owner' && (
        <div style={{ marginBottom: '20px' }}>
            <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
                &larr; Quay lại Trang Quản Trị
            </Link>
        </div>
      )}

      <div className="page-header" style={{ marginBottom: '20px' }}>
        <h1>{pageTitle}</h1>
      </div>

      {/* Nút chuyển đổi chế độ xem chỉ owner và admin mới thấy */}
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

      {/* Hiển thị component tương ứng với chế độ xem và quyền của user */}
      {(viewMode === 'detail' && canViewDetail) 
        ? <InventoryPage /> 
        : <InventorySummaryPage />
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