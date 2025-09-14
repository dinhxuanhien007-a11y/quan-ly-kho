// src/App.jsx
import React from 'react';
import LoginPage from './components/LoginPage';
import AdminLayout from './components/AdminLayout';
import ViewerLayout from './components/ViewerLayout';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { AuthProvider, useAuth } from './context/UserContext';

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
        <div className="login-page-wrapper">
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
        {/* <-- NÂNG CẤP: Thêm thuộc tính closeButton={false} vào đây --> */}
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
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;