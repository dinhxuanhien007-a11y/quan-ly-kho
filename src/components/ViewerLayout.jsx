// src/components/ViewerLayout.jsx
import React, { useState, useEffect } from 'react';
import InventoryPage from '../pages/InventoryPage';
import InventorySummaryPage from '../pages/InventorySummaryPage';

const ViewerLayout = ({ user, userRole }) => {
  // BƯỚC 1: Xác định quyền xem chi tiết. Chỉ 'admin' mới có quyền.
  const canViewDetail = userRole === 'admin';

  // BƯỚC 2: Mặc định chế độ xem là 'summary' (tổng hợp)
  const [viewMode, setViewMode] = useState('summary');

  // BƯỚC 3: Đảm bảo các vai trò không có quyền luôn ở chế độ 'summary'
  useEffect(() => {
    if (!canViewDetail) {
      setViewMode('summary');
    }
  }, [canViewDetail]);

  return (
    <div style={{ padding: '20px' }}>
      {/* BƯỚC 4: Chỉ hiển thị các nút chuyển đổi cho vai trò 'admin' */}
      {canViewDetail ? (
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
            Xem Chi Tiết (Admin)
          </button>
        </div>
      ) : (
        // Các vai trò khác (med, bio) không thấy nút nào cả
        null 
      )}

      {/* BƯỚC 5: Render component dựa trên chế độ xem và quyền truy cập */}
      {(viewMode === 'detail' && canViewDetail) ? (
        <InventoryPage user={user} userRole={userRole} />
      ) : (
        <InventorySummaryPage user={user} userRole={userRole} />
      )}
    </div>
  );
};

export default ViewerLayout;