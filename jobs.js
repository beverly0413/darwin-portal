// jobs.js
import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const jobsRef = collection(db, "jobs");
const form = document.getElementById("jobForm");
const statusEl = document.getElementById("jobStatus");
const listEl = document.getElementById("jobList");

const q = query(jobsRef, orderBy("createdAt", "desc"));
onSnapshot(q, (snap) => {
  listEl.innerHTML = "";
  snap.forEach((doc) => {
    const j = doc.data();
    const created =
      j.createdAt && j.createdAt.toDate
        ? j.createdAt.toDate().toLocaleString()
        : "刚刚";

    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${j.title || "未命名职位"}</h3>
      <p><strong>联系方式：</strong>${j.contact || "未填写"}</p>
      <p>${(j.content || "").replace(/\n/g, "<br>")}</p>
      <small>${created}</small>
    `;
    listEl.appendChild(div);
  });
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const title = document.getElementById("jobTitle").value.trim();
  const contact = document.getElementById("jobContact").value.trim();
  const content = document.getElementById("jobContent").value.trim();

  if (!title || !contact) {
    statusEl.textContent = "职位名称和联系方式是必填的。";
    statusEl.style.color = "red";
    return;
  }

  try {
    await addDoc(jobsRef, {
      title,
      contact,
      content,
      createdAt: serverTimestamp(),
    });
    statusEl.textContent = "招聘信息已发布！";
    statusEl.style.color = "green";
    form.reset();
  } catch (err) {
    console.error(err);
    statusEl.textContent = "发布失败：" + err.message;
    statusEl.style.color = "red";
  }
});
