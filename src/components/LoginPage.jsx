// src/components/LoginPage.jsx
import React, { useState } from 'react';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
// Sửa tại đây: Chỉ cần import các hàm từ thư viện, 
// nhưng import đối tượng 'auth' và 'functions' từ file cấu hình
import { auth, functions } from '../firebaseConfig'; // <-- THAY ĐỔI: IMPORT functions ĐÃ CẤU HÌNH TỪ ĐÂY
import { httpsCallable } from 'firebase/functions'; // <-- THAY ĐỔI: CHỈ GIỮ LẠI httpsCallable
import { toast } from 'react-toastify';
import styles from './LoginPage.module.css';
import { FcGoogle } from 'react-icons/fc';

function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    try {
      // 1. Mở cửa sổ popup để đăng nhập bằng Google
      const result = await signInWithPopup(auth, provider);
      
      toast.info("Xác thực Google thành công. Đang khởi tạo vai trò...");
      
      // 2. Gọi Cloud Function để xử lý và cấp quyền
      // KHÔNG CẦN GỌI const functions = getFunctions(); NỮA
      const processUser = httpsCallable(functions, 'processNewGoogleUser'); // <-- DÙNG functions ĐÃ IMPORT
      await processUser();

      // === THAY ĐỔI QUAN TRỌNG NHẤT NẰM Ở ĐÂY ===
      // 3. Ép buộc trình duyệt lấy lại token mới nhất (có chứa "con dấu" owner)
      await result.user.getIdToken(true); 
      
      toast.success("Đăng nhập và cấp quyền thành công!");

      // 4. Tải lại trang để đảm bảo toàn bộ ứng dụng sử dụng quyền mới
      window.location.reload();

    } catch (error) {
      // ... (Phần xử lý lỗi giữ nguyên)
      let errorMessage = "Đã xảy ra lỗi. Vui lòng thử lại.";
      if (error.code === 'auth/popup-closed-by-user') {
          errorMessage = "Cửa sổ đăng nhập đã bị đóng.";
      } else if (error.message.includes("permission-denied")) {
          errorMessage = "Tài khoản của bạn không được phép truy cập hệ thống này.";
          await auth.signOut();
      }
      
      console.error("Lỗi đăng nhập Google:", error);
      toast.error(errorMessage);
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.loginContainer}>
      <h2>Hệ thống Quản lý Kho</h2>
      <p style={{textAlign: 'center', color: '#666', marginTop: '-10px', marginBottom: '30px'}}>
        Vui lòng đăng nhập bằng tài khoản Google đã được cấp phép.
      </p>
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