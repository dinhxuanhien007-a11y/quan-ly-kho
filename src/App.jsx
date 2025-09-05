// src/App.jsx
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import LoginPage from './components/LoginPage';
import AdminLayout from './components/AdminLayout';
import ViewerLayout from './components/ViewerLayout';
import './App.css';
import { BrowserRouter } from 'react-router-dom';

function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUserRole(userDocSnap.data().role);
        } else {
          setUserRole(null); // Không có vai trò
        }
      } else {
        setUser(null);
        setUserRole(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div>Đang tải...</div>;
  }
  
  const renderLayout = () => {
    // Chỉ 'owner' mới thấy giao diện quản trị
    if (userRole === 'owner') {
      return <AdminLayout />;
    }
    // Tất cả các vai trò còn lại (admin, med, bio) đều là người xem
    if (userRole) {
      return <ViewerLayout user={user} userRole={userRole} />;
    }
    // Nếu không có vai trò, có thể hiển thị trang lỗi hoặc trang viewer mặc định
    return <ViewerLayout user={user} userRole="viewer" />; 
  };

  return (
    <BrowserRouter>
      {user ? (
        renderLayout()
      ) : (
        <div className="login-page-wrapper">
          <LoginPage />
        </div>
      )}
    </BrowserRouter>
  );
}

export default App;