// src/App.jsx

import React from 'react';
import './styles/AdminLayout.css';
import LoginPage from './components/LoginPage';
import AdminLayout from './components/AdminLayout';
import ViewerLayout from './components/ViewerLayout';
// import './App.css'; // Không cần import App.css nữa
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider, useAuth } from './context/UserContext';
import ErrorBoundary from './components/ErrorBoundary';
import AccessDenied from './components/AccessDenied'; // <-- Import trang mới tạo
import { ThemeProvider } from './context/ThemeContext';
import InventoryReconciliationPage from './pages/InventoryReconciliationPage';

// Import login styles để dùng cho wrapper
import loginStyles from './components/LoginPage.module.css';

const AppRoutes = () => {
  const { user, role, userData, loading } = useAuth(); // ← thêm userData

  if (loading) {
    return <div className="loading-screen">Đang tải...</div>;
  }

  if (!user) {
    return (
      <div className={loginStyles.loginPageWrapper}>
        <LoginPage />
      </div>
    );
  }

  if (!role) {
    return <AccessDenied />;
  }

  const canReconcile = role === 'owner' || (role === 'admin' && userData?.canReconcile === true);

  return (
    <Routes>
      {role === 'owner' ? (
        <Route path="/*" element={<AdminLayout />} />
      ) : (
        <Route path="/*" element={<ViewerLayout />} />
      )}
    </Routes>
  );
};

// ✅ CODE MỚI — bọc ThemeProvider ngoài cùng
function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <ToastContainer
            position="top-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
            closeButton={false} 
          />
          <ErrorBoundary>
            <AppRoutes />
          </ErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;