import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBMQ8iHk-rZxEUBuf18uksrgfwzM8LZFY",
  authDomain: "darwin-portal.firebaseapp.com",
  projectId: "darwin-portal",
  storageBucket: "darwin-portal.appspot.com",
  messagingSenderId: "178556543442",
  appId: "1:178556543442:web:ab1cee82835d98b8c0680b",
  measurementId: "G-R7LQ8MLYH69",
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
