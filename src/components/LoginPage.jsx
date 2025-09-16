// src/components/LoginPage.jsx
import React, { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { toast } from 'react-toastify';
import { z } from 'zod';
import styles from './LoginPage.module.css'; // <-- Cập nhật import

const loginSchema = z.object({
    email: z.string().email({ message: "Địa chỉ email không hợp lệ." }),
    password: z.string().min(6, { message: "Mật khẩu phải có ít nhất 6 ký tự." })
});

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  const handleLogin = async (e) => {
    e.preventDefault();
    const validationResult = loginSchema.safeParse({ email, password });

    if (!validationResult.success) {
        toast.warn(validationResult.error.issues[0].message);
        return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, validationResult.data.email, validationResult.data.password);
      toast.success('Đăng nhập thành công!');
    } catch (error) {
      toast.error('Sai email hoặc mật khẩu. Vui lòng thử lại!');
    }
  };

  return (
    // Lưu ý: class 'loginPageWrapper' được áp dụng ở file App.jsx
    <div className={styles.loginContainer}>
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