import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ❗必须与 Firebase 控制台完全一致的配置
const firebaseConfig = {
  apiKey: "AIzaSyBMqBiGHK-rZxEUBUf18uksrcgwfZM8LZFY",
  authDomain: "darwin-portal.firebaseapp.com",
  projectId: "darwin-portal",
  storageBucket: "darwin-portal.firebasestorage.app",
  messagingSenderId: "178556543442",
  appId: "1:178556543442:web:abc1ee82835d98b8c0680b",
  measurementId: "G-R7LQ8MLYH69"
};

// 初始化
export const app = initializeApp(firebaseConfig);

// Firestore
export const db = getFirestore(app);

// Auth（后台登录用）
export const auth = getAuth(app);
