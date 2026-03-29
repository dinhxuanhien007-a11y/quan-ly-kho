// src/components/LoginPage.jsx
import React, { useState, useEffect } from 'react';
import { GoogleAuthProvider, signInWithPopup, getRedirectResult } from 'firebase/auth';
import { auth, functions } from '../firebaseConfig';
import { httpsCallable } from 'firebase/functions';
import { toast } from 'react-toastify';
import styles from './LoginPage.module.css';
import { FcGoogle } from 'react-icons/fc';

function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [debugError, setDebugError] = useState('');

  // Xử lý kết quả redirect (fallback nếu popup bị chặn)
  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        const result = await getRedirectResult(auth);
        if (!result) return;

        setIsLoading(true);
        toast.info("Xác thực Google thành công. Đang khởi tạo vai trò...");
        const processUser = httpsCallable(functions, 'processNewGoogleUser');
        await processUser();
        await result.user.getIdToken(true);
        toast.success("Đăng nhập thành công!");
        window.location.reload();
      } catch (error) {
        const ignoredCodes = ['auth/null-user', 'auth/no-auth-event', 'auth/operation-not-supported-in-this-environment'];
        if (!error.code || ignoredCodes.includes(error.code)) return;
        setDebugError(`${error.code}: ${error.message}`);
        console.error("Lỗi redirect:", error);
        setIsLoading(false);
      }
    };
    handleRedirectResult();
  }, []);

  const handleGoogleLogin = () => {
    // Tạo provider và gọi popup ĐỒNG BỘ từ click event (không async trước)
    // để tránh bị Safari chặn popup
    const provider = new GoogleAuthProvider();
    setIsLoading(true);

    signInWithPopup(auth, provider)
      .then(async (result) => {
        toast.info("Xác thực Google thành công. Đang khởi tạo vai trò...");
        const processUser = httpsCallable(functions, 'processNewGoogleUser');
        await processUser();
        await result.user.getIdToken(true);
        toast.success("Đăng nhập và cấp quyền thành công!");
        window.location.reload();
      })
      .catch(async (error) => {
        let errorMessage = "Đã xảy ra lỗi. Vui lòng thử lại.";
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
          errorMessage = "Cửa sổ đăng nhập đã bị đóng.";
        } else if (error.code === 'auth/popup-blocked') {
          errorMessage = "Trình duyệt chặn popup. Vui lòng cho phép popup và thử lại.";
        } else if (error.message?.includes("permission-denied")) {
          errorMessage = "Tài khoản không được phép truy cập hệ thống này.";
          await auth.signOut();
        }
        setDebugError(`${error.code}: ${error.message}`);
        console.error("Lỗi đăng nhập:", error);
        toast.error(errorMessage);
        setIsLoading(false);
      });
  };

  return (
    <div className={styles.loginContainer}>
      <h2>Hệ thống Quản lý Kho</h2>
      <p style={{textAlign: 'center', color: '#666', marginTop: '-10px', marginBottom: '30px'}}>
        Vui lòng đăng nhập bằng tài khoản Google đã được cấp phép.
      </p>
      {debugError && (
        <div style={{background:'#f8d7da', border:'1px solid #dc3545', borderRadius:'6px', padding:'10px', marginBottom:'16px', fontSize:'12px', wordBreak:'break-all', color:'#721c24'}}>
          <strong>Debug:</strong> {debugError}
        </div>
      )}
      <button 
        className={styles.googleLoginButton} 
        onClick={handleGoogleLogin}
        disabled={isLoading}
      >
        <FcGoogle />
        <span>{isLoading ? "Đang xử lý..." : "Đăng nhập bằng Google"}</span>
      </button>
    </div>
  );
}

export default LoginPage;
