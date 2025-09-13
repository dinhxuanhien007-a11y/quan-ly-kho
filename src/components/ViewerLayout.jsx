// src/components/ViewerLayout.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';
import InventorySummaryPage from '../pages/InventorySummaryPage';
import { useAuth } from '../context/UserContext'; // <-- THÊM IMPORT

const ViewerLayout = () => { // <-- XÓA PROPS
  const { userRole } = useAuth(); // <-- LẤY DỮ LIỆU TỪ CONTEXT

  const canViewDetail = userRole === 'admin' || userRole === 'owner';
  const [viewMode, setViewMode] = useState('summary');
  
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

      {(canViewDetail) ? (
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
      ) : (
        null 
      )}

      {(viewMode === 'detail' && canViewDetail) ? (
        <InventoryPage /> // <-- XÓA PROPS
      ) : (
        <InventorySummaryPage /> // <-- XÓA PROPS
      )}
    </div>
  );
};

export default ViewerLayout;