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

// Import login styles để dùng cho wrapper
import loginStyles from './components/LoginPage.module.css';

const AppRoutes = () => {
  const { user, role, loading } = useAuth(); // Sửa userRole thành role cho nhất quán

  if (loading) {
    return null;
  }

  if (!user) {
    return (
      <div className={loginStyles.loginPageWrapper}>
        <LoginPage />
      </div>
    );
  }

  // Logic điều hướng sau khi đã đăng nhập
  return (
    <Routes>
      {role === 'owner' ? (
        // Nếu là owner, cho phép truy cập tất cả các trang quản trị
        <Route path="/*" element={<AdminLayout />} />
      ) : (
        // Nếu là các vai trò khác, chỉ cho phép truy cập ViewerLayout
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