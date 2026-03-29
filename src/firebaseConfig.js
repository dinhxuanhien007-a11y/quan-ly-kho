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
  databaseURL: "https://kho-ptbiomed-default-rtdb.asia-southeast1.firebasedatabase.app",
};

// Khởi tạo các dịch vụ Firebase
const app = initializeApp(firebaseConfig);

// App Check tạm thời tắt để debug lỗi đăng nhập mobile
// TODO: Bật lại sau khi fix xong
// initializeAppCheck(app, {
//   provider: new ReCaptchaV3Provider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
//   isTokenAutoRefreshEnabled: true,
// });

const db = getFirestore(app);
const auth = getAuth(app);
const functions = getFunctions(app, 'asia-southeast1');
const rtdb = getDatabase(app);

export { db, auth, functions, app, rtdb };
