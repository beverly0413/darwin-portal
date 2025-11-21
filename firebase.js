import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBtmVdF6O0A1AIPLZV1h5bA9L5AXajHQNs",
  authDomain: "darwin-portal.firebaseapp.com",
  projectId: "darwin-portal",
  storageBucket: "darwin-portal.firebasestorage.app",
  messagingSenderId: "178556543442",
  appId: "1:178556543442:web:b99aab0be45772edc0680b",
  measurementId: "G-SN8XJL31TB"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
