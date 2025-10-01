// src/firebaseConfig.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";
import { getDatabase } from "firebase/database";

// Đọc thông tin cấu hình từ biến môi trường
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  databaseURL: "https://kho-ptbiomed-default-rtdb.asia-southeast1.firebasedatabase.app", // <-- THÊM DÒNG NÀY
};

// Khởi tạo các dịch vụ Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app);
const rtdb = getDatabase(app); // <-- THÊM DÒNG NÀY

export { db, auth, functions, app, rtdb }; // <-- THÊM rtdb VÀO EXPORT
