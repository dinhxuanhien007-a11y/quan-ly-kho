// src/components/AdminLayout.jsx

import React from 'react';
import Navbar from './Navbar';
import '../styles/AdminLayout.css';
import { Routes, Route } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import ProductsPage from '../pages/ProductsPage';
import NewImportPage from '../pages/NewImportPage';
import ImportListPage from '../pages/ImportListPage';
import NewExportPage from '../pages/NewExportPage';
import ExportListPage from '../pages/ExportListPage';
import StocktakeListPage from '../pages/StocktakeListPage';
import StocktakeSessionPage from '../pages/StocktakeSessionPage'; // Import trang mới
import LotTracePage from '../pages/LotTracePage';

const AdminLayout = () => {
  return (
    <div className="admin-layout-horizontal">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/new-import" element={<NewImportPage />} />
          <Route path="/new-export" element={<NewExportPage />} />
          <Route path="/imports" element={<ImportListPage />} />
          <Route path="/exports" element={<ExportListPage />} />
          {/* Cập nhật đường dẫn cho Kiểm Kê Kho */}
          <Route path="/stocktakes" element={<StocktakeListPage />} />
          <Route path="/stocktakes/:sessionId" element={<StocktakeSessionPage />} /> {/* Route mới cho trang chi tiết */}
          <Route path="/lot-trace" element={<LotTracePage />} />
        </Routes>
      </main>
    </div>
  );
};

export default AdminLayout;