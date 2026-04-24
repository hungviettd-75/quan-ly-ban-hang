import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// Cấu hình Firebase của bạn
const firebaseConfig = {
  apiKey: "AIzaSyDRDutX8jsq5YV3JaQqvWa4FusBD3JE_ro",
  authDomain: "quan-ly-ban-hang-97cef.firebaseapp.com",
  projectId: "quan-ly-ban-hang-97cef",
  storageBucket: "quan-ly-ban-hang-97cef.firebasestorage.app",
  messagingSenderId: "524346415024",
  appId: "1:524346415024:web:76d20a59a9a8baec196875",
  measurementId: "G-SHJ6ZGNRNS"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);

// Xuất db để App.jsx có thể sử dụng
export const db = getFirestore(app);
export default app;