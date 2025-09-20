// src/components/AdminLayout.jsx

import React, { useState } from 'react';
import Navbar from './Navbar';
import { Routes, Route, useLocation } from 'react-router-dom';
import DashboardPage from '../pages/DashboardPage';
import ProductsPage from '../pages/ProductsPage';
import PartnersPage from '../pages/PartnersPage';
import NewImportPage from '../pages/NewImportPage';
import ImportListPage from '../pages/ImportListPage';
import NewExportPage from '../pages/NewExportPage';
import ExportListPage from '../pages/ExportListPage';
import StocktakeListPage from '../pages/StocktakeListPage';
import StocktakeSessionPage from '../pages/StocktakeSessionPage';
import LotTracePage from '../pages/LotTracePage';
import DataImportPage from '../pages/DataImportPage';
import ExportSlipCounter from './ExportSlipCounter';
import ImportSlipCounter from './ImportSlipCounter'; // <-- Import counter mới
import UsersPage from '../pages/UsersPage';
import FloatingCalculator from './FloatingCalculator'; // <-- Thêm import
import { MdCalculate } from 'react-icons/md';

const AdminLayout = () => {
  const location = useLocation();
  const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);

  return (
    <div className="admin-layout-horizontal">
      <Navbar />
      <main className="main-content">
        {/* Hiển thị counter có điều kiện dựa trên đường dẫn hiện tại */}
        {location.pathname === '/new-export' && <ExportSlipCounter />}
        {location.pathname === '/new-import' && <ImportSlipCounter />}
        
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/partners" element={<PartnersPage />} />
          <Route path="/new-import" element={<NewImportPage />} />
          <Route path="/new-export" element={<NewExportPage />} />
          <Route path="/imports" element={<ImportListPage />} />
          <Route path="/exports" element={<ExportListPage />} />
          <Route path="/stocktakes" element={<StocktakeListPage />} />
          <Route path="/stocktakes/:sessionId" element={<StocktakeSessionPage />} />
          <Route path="/lot-trace" element={<LotTracePage />} />
          <Route path="/import-data" element={<DataImportPage />} />
          <Route path="/users" element={<UsersPage />} />
        </Routes>
      </main>
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

export default AdminLayout;