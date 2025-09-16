// src/App.jsx

import React from 'react';
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
  const { user, userRole, loading } = useAuth();
  if (loading) {
    return null; 
  }

  return (
    <>
      {user ? (
        <Routes>
          {userRole === 'owner' ? (
            <Route path="/*" element={<AdminLayout />} />
          ) : (
            <Route path="/*" element={<Navigate to="/view" />} />
          )}
          <Route path="/view/*" element={<ViewerLayout />} />
        </Routes>
      ) : (
        <div className={loginStyles.loginPageWrapper}>
          <LoginPage />
        </div>
      )}
    </>
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