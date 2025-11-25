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

// Import login styles để dùng cho wrapper
import loginStyles from './components/LoginPage.module.css';

const AppRoutes = () => {
  const { user, role, loading } = useAuth();

  if (loading) {
    return <div className="loading-screen">Đang tải...</div>; // Hoặc component Spinner của bạn
  }

  // 1. Chưa đăng nhập -> Hiện trang Login
  if (!user) {
    return (
      <div className={loginStyles.loginPageWrapper}>
        <LoginPage />
      </div>
    );
  }

  // 2. Đã đăng nhập nhưng KHÔNG CÓ QUYỀN (role rỗng hoặc null) -> Hiện trang Từ chối
  if (!role) {
    return <AccessDenied />;
  }

  // 3. Có quyền -> Phân luồng
  return (
    <Routes>
      {role === 'owner' ? (
        // Nếu là owner -> AdminLayout
        <Route path="/*" element={<AdminLayout />} />
      ) : (
        // Nếu là các role hợp lệ khác (med, bio, admin...) -> ViewerLayout
        <Route path="/*" element={<ViewerLayout />} />
      )}
    </Routes>
  );
};

function App() {
  return (
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
  );
}

export default App;