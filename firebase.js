import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// 你的 Firebase 配置
const firebaseConfig = {
  apiKey: "AIzaSyBMQ8iHk-rZxEUBuf18uksrgfwzM8LZFY",
  authDomain: "darwin-portal.firebaseapp.com",
  projectId: "darwin-portal",
  storageBucket: "darwin-portal.appspot.com",
  messagingSenderId: "178556543442",
  appId: "1:178556543442:web:ab1cee82835d98b8c0680b",
  measurementId: "G-R7LQ8MLYH69",
};

// 初始化
export const app = initializeApp(firebaseConfig);

// Firestore（必需）
export const db = getFirestore(app);

// Auth（后台登录必需）🔥🔥🔥
export const auth = getAuth(app);
