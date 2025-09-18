// src/components/ViewerLayout.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';
import InventorySummaryPage from '../pages/InventorySummaryPage';
import { useAuth } from '../context/UserContext';

const ViewerLayout = () => {
  const { userRole } = useAuth();
  const canViewDetail = userRole === 'admin' || userRole === 'owner';
  const [viewMode, setViewMode] = useState('summary');

  // Tính toán tiêu đề động
  const pageTitle = useMemo(() => {
    switch (userRole) {
      case 'med':
        return 'PT Biomed - Team MED';
      case 'bio':
        return 'PT Biomed - Team BIO';
      case 'admin':
        return viewMode === 'summary' ? 'PT Biomed - Admin' : 'PT Biomed - Inventory';
      case 'owner':
        return 'Kho PT Biomed';
      default:
        return 'Xem Tồn Kho';
    }
  }, [userRole, viewMode]);

  // Cập nhật tiêu đề tab trình duyệt
  useEffect(() => {
    document.title = pageTitle;
  }, [pageTitle]);
  
  useEffect(() => {
    if (!canViewDetail) {
      setViewMode('summary');
    }
  }, [canViewDetail]);

  return (
    <div style={{ padding: '20px' }}>
      {userRole === 'owner' && (
        <div style={{ marginBottom: '20px' }}>
            <Link to="/" className="btn-secondary" style={{ textDecoration: 'none' }}>
                &larr; Quay lại Trang Quản Trị
            </Link>
        </div>
      )}

      {/* Hiển thị tiêu đề trên trang */}
      <div className="page-header" style={{ marginBottom: '20px' }}>
        <h1>{pageTitle}</h1>
      </div>

      {(canViewDetail) && (
        <div className="view-toggle" style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setViewMode('summary')}
            className={viewMode === 'summary' ? 'btn-primary' : 'btn-secondary'}
            style={{width: 'auto'}}
          >
            Xem Tổng Hợp
          </button>
          <button 
            onClick={() => setViewMode('detail')}
            className={viewMode === 'detail' ? 'btn-primary' : 'btn-secondary'}
            style={{width: 'auto'}}
          >
            Xem Chi Tiết
          </button>
        </div>
      )}

      {(viewMode === 'detail' && canViewDetail) ? (
        <InventoryPage />
      ) : (
        <InventorySummaryPage />
      )}
    </div>
  );
};

export default ViewerLayout;