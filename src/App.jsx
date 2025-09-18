// src/App.jsx

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

// Import các trang và component cần thiết
import LoginPage from './components/LoginPage';
import AdminLayout from './components/AdminLayout';
import ViewerLayout from './components/ViewerLayout';
import SetupPasswordPage from './pages/SetupPasswordPage';
import { AuthProvider, useAuth } from './context/UserContext';
import ErrorBoundary from './components/ErrorBoundary';
import loginStyles from './components/LoginPage.module.css';
import Spinner from './components/Spinner';

// Component con để render trang Login có style bao bọc
const LoginPageWrapper = () => (
  <div className={loginStyles.loginPageWrapper}>
    <LoginPage />
  </div>
);

// Component AppRoutes sẽ quyết định hiển thị luồng nào
const AppRoutes = () => {
  const { user, userRole, loading } = useAuth();

  // Trong khi chờ xác thực, hiển thị spinner
  if (loading) {
    return <Spinner />;
  }

  // === LUỒNG 1: NẾU USER CHƯA ĐĂNG NHẬP ===
  if (!user) {
    return (
      <Routes>
        <Route path="/setup-password" element={<SetupPasswordPage />} />
        {/* Bất kỳ đường dẫn nào khác đều sẽ hiển thị trang Login */}
        <Route path="/*" element={<LoginPageWrapper />} />
      </Routes>
    );
  }

  // === LUỒNG 2: NẾU USER ĐÃ ĐĂNG NHẬP ===
  // Phân quyền dựa trên vai trò
  if (userRole === 'owner') {
    return (
      <Routes>
        <Route path="/view/*" element={<ViewerLayout />} />
        <Route path="/*" element={<AdminLayout />} />
      </Routes>
    );
  } else { // Dành cho các vai trò khác như admin, med, bio
    return (
      <Routes>
        <Route path="/view/*" element={<ViewerLayout />} />
        {/* Bất kỳ đường dẫn nào khác đều sẽ chuyển hướng về /view */}
        <Route path="/*" element={<Navigate to="/view" />} />
      </Routes>
    );
  }
};

// Component App chính
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