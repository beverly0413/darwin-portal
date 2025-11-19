// rent.js
import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 集合：rents
const rentsRef = collection(db, "rents");

const form = document.getElementById("rentForm");
const statusEl = document.getElementById("rentStatus");
const listEl = document.getElementById("rentList");

// 实时监听最新房源
const q = query(rentsRef, orderBy("createdAt", "desc"));
onSnapshot(q, (snap) => {
  listEl.innerHTML = "";
  snap.forEach((doc) => {
    const r = doc.data();
    const created =
      r.createdAt && r.createdAt.toDate
        ? r.createdAt.toDate().toLocaleString()
        : "刚刚";

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${r.title || "未命名房源"}</h3>
      <p><strong>联系方式：</strong>${r.contact || "未填写"}</p>
      <p>${(r.content || "").replace(/\n/g, "<br>")}</p>
      <small>${created}</small>
    `;
    listEl.appendChild(div);
  });
});

// 提交房源
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("rentTitle").value.trim();
  const contact = document.getElementById("rentContact").value.trim();
  const content = document.getElementById("rentContent").value.trim();

  if (!title || !contact) {
    statusEl.textContent = "房源标题和联系方式是必填的。";
    statusEl.style.color = "red";
    return;
  }

  try {
    await addDoc(rentsRef, {
      title,
      contact,
      content,
      createdAt: serverTimestamp(),
    });
    statusEl.textContent = "房源已发布！";
    statusEl.style.color = "green";
    form.reset();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "发布失败：" + err.message;
    statusEl.style.color = "red";
  }
});
