// src/pages/SetupPasswordPage.jsx

import React, { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
// BƯỚC 1: Thêm 'signInWithEmailAndPassword' vào
import { confirmPasswordReset, verifyPasswordResetCode, signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebaseConfig';
import { toast } from 'react-toastify';
import { z } from 'zod';
import styles from '../components/LoginPage.module.css';

const passwordSchema = z.object({
  password: z.string().min(6, { message: "Mật khẩu phải có ít nhất 6 ký tự." }),
  confirmPassword: z.string()
}).refine(data => data.password === data.confirmPassword, {
  message: "Mật khẩu xác nhận không khớp.",
  path: ["confirmPassword"],
});

const SetupPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const oobCode = searchParams.get('oobCode');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSetting, setIsSetting] = useState(false);
  const [email, setEmail] = useState('');

  React.useEffect(() => {
    if (!oobCode) {
      toast.error("Đường dẫn không hợp lệ hoặc đã hết hạn.");
      navigate('/');
      return;
    }
    // Xác thực mã trong link để lấy email
    verifyPasswordResetCode(auth, oobCode)
      .then(userEmail => {
        setEmail(userEmail);
      })
      .catch(() => {
        toast.error("Đường dẫn không hợp lệ hoặc đã hết hạn.");
        navigate('/');
      });
  }, [oobCode, navigate]);

  // BƯỚC 2: Cập nhật lại toàn bộ hàm handleSubmit
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validationResult = passwordSchema.safeParse({ password, confirmPassword });

    if (!validationResult.success) {
      toast.warn(validationResult.error.issues[0].message);
      return;
    }
    
    setIsSetting(true);
    try {
      // Tác vụ 1: Thiết lập mật khẩu mới cho người dùng
      await confirmPasswordReset(auth, oobCode, password);
      toast.info('Mật khẩu đã được thiết lập. Đang tự động đăng nhập...');

      // Tác vụ 2: Tự động đăng nhập bằng email và mật khẩu vừa tạo
      await signInWithEmailAndPassword(auth, email, password);
      toast.success('Đăng nhập thành công!');
      
      // Tác vụ 3: Điều hướng về trang chủ.
      // Lúc này người dùng đã được xác thực và đăng nhập.
      navigate('/');

    } catch (error) {
      toast.error('Đã xảy ra lỗi. Vui lòng thử lại hoặc quay lại trang đăng nhập.');
      console.error(error);
    } finally {
      setIsSetting(false);
    }
  };

  if (!email) {
    return <div>Đang xác thực...</div>;
  }

  return (
    <div className={styles.loginPageWrapper}>
        <div className={styles.loginContainer}>
        <h2>Thiết Lập Mật Khẩu</h2>
        <p style={{textAlign: 'center', marginBottom: '20px'}}>Chào mừng <strong>{email}</strong>!</p>
        <form onSubmit={handleSubmit}>
            <div className="form-group">
                <label>Mật khẩu mới</label>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                />
            </div>
            <div className="form-group">
                <label>Xác nhận mật khẩu mới</label>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                />
            </div>
            <button type="submit" disabled={isSetting}>
                {isSetting ? 'Đang xử lý...' : 'Lưu và Đăng nhập'}
            </button>
        </form>
        </div>
    </div>
  );
};

export default SetupPasswordPage;