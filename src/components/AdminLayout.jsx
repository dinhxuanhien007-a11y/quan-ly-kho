// src/components/AdminLayout.jsx
import React from 'react';
import Sidebar from './Sidebar';
import '../styles/AdminLayout.css';
import { Routes, Route } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import ProductsPage from '../pages/ProductsPage';
// Import trang mới
import NewImportPage from '../pages/NewImportPage';
// Import trang mới
import ImportListPage from '../pages/ImportListPage';

const AdminLayout = () => {
  return (
    <div className="admin-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          {/* THÊM ROUTE MỚI */}
          <Route path="/new-import" element={<NewImportPage />} />
          {/* THÊM ROUTE MỚI */}
          <Route path="/imports" element={<ImportListPage />} />
        </Routes>
      </main>
    </div>
  );
};

export default AdminLayout;