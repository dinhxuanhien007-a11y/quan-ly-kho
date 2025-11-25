import React from 'react';
import { useAuth } from '../context/UserContext';

const AccessDenied = () => {
  const { logout } = useAuth();

  return (
    <div style={{ 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column', 
      justifyContent: 'center', 
      alignItems: 'center', 
      backgroundColor: '#f8f9fa',
      textAlign: 'center',
      padding: '20px'
    }}>
      <h1 style={{ color: '#dc3545', fontSize: '3rem', marginBottom: '10px' }}>⛔</h1>
      <h2 style={{ color: '#333' }}>Truy cập bị từ chối</h2>
      <p style={{ color: '#666', maxWidth: '500px', marginBottom: '30px' }}>
        Tài khoản Gmail này chưa được cấp quyền truy cập vào hệ thống Kho PT Biomed.
        <br />Vui lòng liên hệ Quản trị viên (Owner) để được thêm vào danh sách.
      </p>
      <button 
        onClick={logout} 
        style={{
          padding: '10px 20px',
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        Đăng xuất
      </button>
    </div>
  );
};

export default AccessDenied;