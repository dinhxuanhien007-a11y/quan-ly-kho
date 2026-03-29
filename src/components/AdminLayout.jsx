// src/components/AdminLayout.jsx

import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import Navbar from './Navbar';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import ExpiryNotificationBanner from './ExpiryNotificationBanner';
import ImportSlipCounter from './ImportSlipCounter';
import ExportSlipCounter from './ExportSlipCounter';
import { useAuth } from '../context/UserContext';
import FloatingToolsModal from './FloatingToolsModal';
import FloatingCalculator from './FloatingCalculator';
import { usePresence } from '../hooks/usePresence';

const DashboardPage = lazy(() => import('../pages/DashboardPage'));
const ProductsPage = lazy(() => import('../pages/ProductsPage'));
const PartnersPage = lazy(() => import('../pages/PartnersPage'));
const NewImportPage = lazy(() => import('../pages/NewImportPage'));
const ImportListPage = lazy(() => import('../pages/ImportListPage'));
const NewExportPage = lazy(() => import('../pages/NewExportPage'));
const ExportListPage = lazy(() => import('../pages/ExportListPage'));
const StocktakeListPage = lazy(() => import('../pages/StocktakeListPage'));
const StocktakeSessionPage = lazy(() => import('../pages/StocktakeSessionPage'));
const CollaborativeStocktakePage = lazy(() => import('../pages/CollaborativeStocktakePage'));
const LotTracePage = lazy(() => import('../pages/LotTracePage'));
const DataImportPage = lazy(() => import('../pages/DataImportPage'));
const UsersPage = lazy(() => import('../pages/UsersPage'));
const ProductLedgerPage = lazy(() => import('../pages/ProductLedgerPage'));
const InventoryReconciliationPage = lazy(() => import('../pages/InventoryReconciliationPage'));
const ViewerLayout = lazy(() => import('./ViewerLayout'));

const AdminLayout = () => {
  const location = useLocation();
  const { role, user } = useAuth();

  usePresence();

  // === BƯỚC 1: DI CHUYỂN CÁC STATE VÀ HÀM LÊN TRÊN ===
  const [isToolsModalVisible, setIsToolsModalVisible] = useState(false);
  const [isCalculatorVisible, setIsCalculatorVisible] = useState(false);

  const toggleToolsModal = useCallback(() => {
    setIsToolsModalVisible(prev => !prev);
  }, []);
  const toggleCalculator = useCallback(() => {
    setIsCalculatorVisible(prev => !prev);
  }, []);
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

        <Suspense fallback={<div className="loading-screen">Đang tải...</div>}>
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
            <Route path="/stocktakes/:sessionId/collaborate" element={<CollaborativeStocktakePage />} />
            <Route path="/lot-trace" element={<LotTracePage />} />
            <Route path="/import-data" element={<DataImportPage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="/product-ledger" element={<ProductLedgerPage />} />
            <Route path="/doi-chieu-ton-kho" element={<InventoryReconciliationPage />} />
          </Routes>
        </Suspense>
      </main>

      {/* Icon floating đã ẩn — dùng phím F2 để mở công cụ nhanh */}

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