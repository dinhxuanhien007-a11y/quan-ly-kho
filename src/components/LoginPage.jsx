// src/components/LoginPage.jsx

import React, { useState } from 'react';
// Bước 1: Import các hàm cần thiết từ Firebase
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig'; // Import đối tượng 'auth'

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Bước 2: Cập nhật hàm handleLogin
  const handleLogin = async (e) => {
    e.preventDefault();
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // Đăng nhập thành công
      console.log('Đăng nhập thành công!', userCredential.user);
      alert('Đăng nhập thành công!');
    } catch (error) {
      // Xử lý lỗi
      console.error('Lỗi đăng nhập:', error.code, error.message);
      alert('Sai email hoặc mật khẩu. Vui lòng thử lại!');
    }
  };

  return (
    <div className="login-container">
      <h2>Đăng Nhập Hệ Thống</h2>
      <form onSubmit={handleLogin}>
        <div className="form-group">
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="form-group">
          <label>Mật khẩu</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <button type="submit">Đăng nhập</button>
      </form>
    </div>
  );
}

export default LoginPage;