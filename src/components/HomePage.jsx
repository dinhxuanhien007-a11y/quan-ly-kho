// src/components/HomePage.jsx

import React from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../firebaseConfig';

function HomePage({ user }) {
  // THAY THẾ CONSOLE.LOG CŨ BẰNG 4 DÒNG NÀY
  console.log('--- DEBUGGING HOMEPAGE ---');
  console.log('Toàn bộ object user:', user);
  console.log('Giá trị của user.email là:', user?.email);
  console.log('Kiểu dữ liệu của user.email là:', typeof user?.email);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      console.log('Đăng xuất thành công!');
    } catch (error) {
      console.error('Lỗi đăng xuất:', error);
    }
  };

  return (
    <div className="homepage-container">
      <h1>Chào mừng trở lại, {user?.email}!</h1>
      <p>Đây là trang quản trị kho của bạn.</p>
      <button onClick={handleLogout} className="logout-button">
        Đăng xuất
      </button>
    </div>
  );
}

export default HomePage;