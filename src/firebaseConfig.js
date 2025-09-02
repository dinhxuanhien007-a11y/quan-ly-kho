// src/firebaseConfig.js

import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// == THÔNG TIN CẤU HÌNH FIREBASE CỦA BẠN ==
const firebaseConfig = {
  apiKey: "AIzaSyDLnv85ipAXZ4IXCIKMNFpQgZQCy_uF3PY",
  authDomain: "kho-ptbiomed.firebaseapp.com",
  projectId: "kho-ptbiomed",
  storageBucket: "kho-ptbiomed.appspot.com",
  messagingSenderId: "41298806902",
  appId: "1:41298806902:web:7adb67dd5ee55918887757"
};

// Khởi tạo ứng dụng Firebase
const app = initializeApp(firebaseConfig);

// Xuất ra các dịch vụ để sử dụng trong toàn bộ ứng dụng
export const db = getFirestore(app);      // Dịch vụ cơ sở dữ liệu Firestore
export const auth = getAuth(app);         // Dịch vụ xác thực người dùng