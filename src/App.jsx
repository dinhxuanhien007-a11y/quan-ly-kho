// src/App.jsx
import React, { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebaseConfig'; // Import thêm db
import { doc, getDoc } from 'firebase/firestore'; // Import các hàm của Firestore
import LoginPage from './components/LoginPage';
import AdminLayout from './components/AdminLayout';
import ViewerLayout from './components/ViewerLayout';
import './App.css';
import { BrowserRouter } from 'react-router-dom';

function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // State mới để lưu vai trò
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        // Nếu có người dùng đăng nhập
        setUser(currentUser);
        // Lấy vai trò của họ từ Firestore
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUserRole(userDocSnap.data().role); // Lưu vai trò vào state
        } else {
          console.log("Không tìm thấy thông tin vai trò cho người dùng này.");
          setUserRole('viewer'); // Mặc định là viewer nếu không có thông tin
        }
      } else {
        // Nếu không có ai đăng nhập
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
  if (userRole === 'owner') { // Chỉ cho phép 'owner'
    return <AdminLayout />;
  }
  // Tất cả các vai trò khác (admin, med, bio) sẽ thấy giao diện người xem
  return <ViewerLayout user={user} userRole={userRole} />;
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