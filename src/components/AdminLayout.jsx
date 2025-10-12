// src/components/AdminLayout.jsx

import React, { useState, useEffect } from 'react';
import Navbar from './Navbar';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
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
import { useAuth } from '../context/UserContext';
import FloatingToolsModal from './FloatingToolsModal'; 
import { FiGrid } from 'react-icons/fi';
import SalesAnalyticsPage from '../pages/SalesAnalyticsPage';
import ProductLedgerPage from '../pages/ProductLedgerPage';
import { usePresence } from '../hooks/usePresence';

const AdminLayout = () => {
  const location = useLocation();
  const { role, user } = useAuth();

  usePresence();

  // === BƯỚC 1: DI CHUYỂN CÁC STATE VÀ HÀM LÊN TRÊN ===
  const [isToolsModalVisible, setIsToolsModalVisible] = useState(false);
  const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);

  const toggleToolsModal = () => {
    setIsToolsModalVisible(prev => !prev);
  };
  const toggleCalculator = () => {
    setIsCalculatorVisible(prev => !prev);
  };
  // =======================================================

  // === BƯỚC 2: ĐẶT useEffect Ở DƯỚI SAU KHI CÁC HÀM ĐÃ ĐƯỢC ĐỊNH NGHĨA ===
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        toggleToolsModal();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleToolsModal]); 
  // =======================================================================

  return (
    <div className="admin-layout-horizontal">
      <Navbar />
      <main className="main-content">
        {role === 'owner' && <ExpiryNotificationBanner />}
        {location.pathname === '/new-export' && <ExportSlipCounter />}
        {location.pathname === '/new-import' && <ImportSlipCounter />}

        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/view" element={<ViewerLayout />} />
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
          <Route path="/sales-analytics" element={<SalesAnalyticsPage />} />
          <Route path="/product-ledger" element={<ProductLedgerPage />} />
        </Routes>
      </main>

      {role === 'owner' ? (
        <button 
          className="floating-toggle-btn" 
          onClick={toggleToolsModal}
          title="Mở công cụ nhanh (F2)"
        >
          <FiGrid />
        </button>
      ) : (
        <button 
          className="floating-toggle-btn" 
          onClick={toggleCalculator}
          title="Mở máy tính (F2)"
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