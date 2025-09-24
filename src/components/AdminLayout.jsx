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
import UsersPage from '../pages/UsersPage';
import FloatingCalculator from './FloatingCalculator';
import { MdCalculate } from 'react-icons/md';
import ExpiryNotificationBanner from './ExpiryNotificationBanner';
import ImportSlipCounter from './ImportSlipCounter';
import ExportSlipCounter from './ExportSlipCounter';
import ViewerLayout from './ViewerLayout';
import { useAuth } from '../hooks/useAuth';
import FloatingToolsModal from './FloatingToolsModal'; 
import { FiGrid } from 'react-icons/fi';
import SalesAnalyticsPage from '../pages/SalesAnalyticsPage'; // Thêm import
import ProductLedgerPage from '../pages/ProductLedgerPage';

const AdminLayout = () => {
  const location = useLocation();
  const { role } = useAuth();
  
  const [isToolsModalVisible, setIsToolsModalVisible] = useState(false);
  const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);

  // HÀM MỚI: TẠO CHỨC NĂNG CHUYỂN ĐỔI (TOGGLE)
  const toggleToolsModal = () => {
    setIsToolsModalVisible(prev => !prev);
  };
  const toggleCalculator = () => {
    setIsCalculatorVisible(prev => !prev);
  };

  return (
    <div className="admin-layout-horizontal">
      <Navbar />
      <main className="main-content">
        {role === 'owner' && <ExpiryNotificationBanner />}
        {location.pathname === '/new-export' && <ExportSlipCounter />}
        {location.pathname === '/new-import' && <ImportSlipCounter />}

        <Routes>
          <Route path="/view" element={<ViewerLayout />} />
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
          <Route path="/sales-analytics" element={<SalesAnalyticsPage />} /> // Thêm route mới
          <Route path="/product-ledger" element={<ProductLedgerPage />} /> {/* THÊM DÒNG NÀY */}
        </Routes>
      </main>
      
      {role === 'owner' ? (
        <button 
          className="floating-toggle-btn" 
          onClick={toggleToolsModal} // SỬ DỤNG HÀM MỚI
          title="Mở công cụ nhanh"
        >
          <FiGrid />
        </button>
      ) : (
        <button 
          className="floating-toggle-btn" 
          onClick={toggleCalculator} // SỬ DỤNG HÀM MỚI
          title="Mở máy tính (Có thể dùng bàn phím)"
        >
          <MdCalculate />
        </button>
      )}

      {isToolsModalVisible && role === 'owner' && (
        <FloatingToolsModal onClose={toggleToolsModal} />
      )}
      
      {isCalculatorVisible && role !== 'owner' && (
        <FloatingCalculator onClose={toggleCalculator} />
      )}
    </div>
  );
};

export default AdminLayout;