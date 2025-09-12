// src/components/ViewerLayout.jsx
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom'; // <-- THÊM IMPORT
import InventoryPage from '../pages/InventoryPage';
import InventorySummaryPage from '../pages/InventorySummaryPage';

const ViewerLayout = ({ user, userRole }) => {
  const canViewDetail = userRole === 'admin' || userRole === 'owner'; // <-- OWNER CŨNG CÓ THỂ XEM CHI TIẾT
  const [viewMode, setViewMode] = useState('summary');
  
  useEffect(() => {
    if (!canViewDetail) {
      setViewMode('summary');
    }
  }, [canViewDetail]);

  return (
    <div style={{ padding: '20px' }}>
      {/* THÊM NÚT QUAY LẠI CHO OWNER */}
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

      {(viewMode === 'detail' && canViewDetail) ?
      (
        <InventoryPage user={user} userRole={userRole} />
      ) : (
        <InventorySummaryPage user={user} userRole={userRole} />
      )}
    </div>
  );
};

export default ViewerLayout;