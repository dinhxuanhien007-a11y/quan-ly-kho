// src/App.jsx
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebaseConfig';
import { doc, getDoc } from 'firebase/firestore';
import LoginPage from './components/LoginPage';
import AdminLayout from './components/AdminLayout';
import ViewerLayout from './components/ViewerLayout';
import './App.css';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

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
          setUserRole(null); 
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
  
  return (
    <BrowserRouter>
      {user ? (
        <Routes>
          {/* --- ROUTE CHO GIAO DIỆN QUẢN TRỊ (CHỈ OWNER) --- */}
          {userRole === 'owner' ? (
            <Route path="/*" element={<AdminLayout />} />
          ) : (
            // Nếu không phải owner, truy cập vào trang admin sẽ bị điều hướng
            <Route path="/*" element={<Navigate to="/view" />} />
          )}

          {/* --- ROUTE CHO GIAO DIỆN NGƯỜI XEM (TẤT CẢ CÁC VAI TRÒ) --- */}
          <Route path="/view/*" element={<ViewerLayout user={user} userRole={userRole} />} />
          
        </Routes>
      ) : (
        <div className="login-page-wrapper">
          <LoginPage />
        </div>
      )}
    </BrowserRouter>
  );
}

export default App;