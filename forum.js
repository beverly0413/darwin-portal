// forum.js
import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const postsRef = collection(db, "posts");
const form = document.getElementById("postForm");
const statusEl = document.getElementById("status");
const listEl = document.getElementById("postList");

const q = query(postsRef, orderBy("createdAt", "desc"));
onSnapshot(q, (snap) => {
  listEl.innerHTML = "";
  snap.forEach((doc) => {
    const p = doc.data();
    const created =
      p.createdAt && p.createdAt.toDate
        ? p.createdAt.toDate().toLocaleString()
        : "刚刚";

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${p.title || "无标题"}</h3>
      <p>${(p.content || "").replace(/\n/g, "<br>")}</p>
      <small>${created}</small>
    `;
    listEl.appendChild(div);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("postTitle").value.trim();
  const content = document.getElementById("postContent").value.trim();

  if (!title) {
    statusEl.textContent = "标题是必填的。";
    statusEl.style.color = "red";
    return;
  }

  try {
    await addDoc(postsRef, {
      title,
      content,
      createdAt: serverTimestamp(),
    });
    statusEl.textContent = "发布成功！";
    statusEl.style.color = "green";
    form.reset();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "发布失败：" + err.message;
    statusEl.style.color = "red";
  }
});
