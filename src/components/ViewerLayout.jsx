// src/components/ViewerLayout.jsx
import React from 'react';
import { Routes, Route } from 'react-router-dom';
import InventoryPage from '../pages/InventoryPage';

// Nhận props từ App.jsx
const ViewerLayout = ({ user, userRole }) => {
  return (
    <div style={{ padding: '20px' }}>
      <Routes>
        {/* Truyền props xuống cho InventoryPage */}
        <Route path="/" element={<InventoryPage user={user} userRole={userRole} />} />
      </Routes>
    </div>
  );
};

export default ViewerLayout;