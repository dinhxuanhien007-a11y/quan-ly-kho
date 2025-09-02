import React from 'react';
import Sidebar from './Sidebar';
import '../styles/AdminLayout.css';

const AdminLayout = () => {
  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="main-content">
        <h1>Nội dung chính</h1>
        <p>Chọn một chức năng từ menu bên trái.</p>
      </main>
    </div>
  );
};

export default AdminLayout;