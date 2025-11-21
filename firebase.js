// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

// darwin-life-hub 的 Web 配置
const firebaseConfig = {
  apiKey: "AIzaSyAGLdakGGRZIS_S9zjSlERgLMjp5a0OeI",
  authDomain: "darwin-life-hub.firebaseapp.com",
  projectId: "darwin-life-hub",
  storageBucket: "darwin-life-hub.firebasestorage.app",
  messagingSenderId: "198696032332",
  appId: "1:198696032332:web:0f6b83515066549b9fbce9",
  measurementId: "G-RHRRP1LH4T"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
