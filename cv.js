// cv.js
import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const cvsRef = collection(db, "cvs");
const form = document.getElementById("cvForm");
const statusEl = document.getElementById("cvStatus");
const listEl = document.getElementById("cvList");

const q = query(cvsRef, orderBy("createdAt", "desc"));
onSnapshot(q, (snap) => {
  listEl.innerHTML = "";
  snap.forEach((doc) => {
    const c = doc.data();
    const created =
      c.createdAt && c.createdAt.toDate
        ? c.createdAt.toDate().toLocaleString()
        : "刚刚";

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${c.title || "匿名求职"}</h3>
      <p><strong>联系方式：</strong>${c.contact || "未填写"}</p>
      <p>${(c.content || "").replace(/\n/g, "<br>")}</p>
      <small>${created}</small>
    `;
    listEl.appendChild(div);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("cvTitle").value.trim();
  const contact = document.getElementById("cvContact").value.trim();
  const content = document.getElementById("cvContent").value.trim();

  if (!title || !contact) {
    statusEl.textContent = "职位和联系方式是必填的。";
    statusEl.style.color = "red";
    return;
  }

  try {
    await addDoc(cvsRef, {
      title,
      contact,
      content,
      createdAt: serverTimestamp(),
    });
    statusEl.textContent = "求职信息已发布！";
    statusEl.style.color = "green";
    form.reset();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "发布失败：" + err.message;
    statusEl.style.color = "red";
  }
});
