// src/components/AdminLayout.jsx
import React from 'react';
import Sidebar from './Sidebar';
import '../styles/AdminLayout.css';
import { Routes, Route } from 'react-router-dom'; // Import Routes và Route
import DashboardPage from '../pages/DashboardPage'; // Import các trang
import ProductsPage from '../pages/ProductsPage';

const AdminLayout = () => {
  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="main-content">
        <Routes> {/* Định nghĩa các tuyến đường */}
          <Route path="/" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
        </Routes>
      </main>
    </div>
  );
};

export default AdminLayout;