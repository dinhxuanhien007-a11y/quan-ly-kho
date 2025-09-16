// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// == THÔNG TIN CẤU HÌNH FIREBASE CỦA BẠN ==
// Đọc thông tin cấu hình từ biến môi trường
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Khởi tạo ứng dụng Firebase
const app = initializeApp(firebaseConfig);

// Xuất ra các dịch vụ để sử dụng trong toàn bộ ứng dụng
export const db = getFirestore(app);      // Dịch vụ cơ sở dữ liệu Firestore
export const auth = getAuth(app);         // Dịch vụ xác thực người dùng