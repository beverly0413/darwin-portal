// admin.js
import { auth, db } from "./firebase.js";

import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  collection,
  addDoc,
  serverTimestamp,
  getDocs,
  query,
  orderBy,
  limit,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* =============== DOM 引用 =============== */
const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

const adminEmailBadge = document.getElementById("adminEmailBadge");
const logoutBtn = document.getElementById("logoutBtn");

const newsTitle = document.getElementById("newsTitle");
const newsSummary = document.getElementById("newsSummary");
const newsImageUrl = document.getElementById("newsImageUrl");
const publishNewsBtn = document.getElementById("publishNewsBtn");
const newsStatus = document.getElementById("newsStatus");

const reloadAllBtn = document.getElementById("reloadAllBtn");
const newsListBox = document.getElementById("newsListBox");
const postsListBox = document.getElementById("postsListBox");
const jobsListBox = document.getElementById("jobsListBox");
const rentsListBox = document.getElementById("rentsListBox");
const cvsListBox = document.getElementById("cvsListBox");

/* =============== 登录状态监听 =============== */
onAuthStateChanged(auth, (user) => {
  if (user) {
    // 已登录
    loginSection.style.display = "none";
    adminSection.style.display = "block";
    adminEmailBadge.textContent = user.email || "已登录";
    loadAllLists();
  } else {
    // 未登录
    adminSection.style.display = "none";
    loginSection.style.display = "block";
    loginStatus.textContent = "";
  }
});

/* =============== 登录 / 登出 =============== */
loginBtn.addEventListener("click", async () => {
  loginStatus.textContent = "";
  loginStatus.className = "status";

  const email = loginEmail.value.trim();
  const password = loginPassword.value.trim();
  if (!email || !password) {
    loginStatus.textContent = "请输入邮箱和密码。";
    loginStatus.classList.add("err");
    return;
  }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    loginStatus.textContent = "登录成功，正在进入后台…";
    loginStatus.classList.add("ok");
  } catch (err) {
    console.error(err);
    loginStatus.textContent = "登录失败：" + err.message;
    loginStatus.classList.add("err");
  }
});

logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
});

/* =============== 发布新闻 =============== */
publishNewsBtn.addEventListener("click", async () => {
  newsStatus.textContent = "";
  newsStatus.className = "status";

  const title = newsTitle.value.trim();
  const summary = newsSummary.value.trim();
  const imageUrl = newsImageUrl.value.trim();

  if (!title || !summary) {
    newsStatus.textContent = "标题和内容摘要不能为空。";
    newsStatus.classList.add("err");
    return;
  }

  try {
    await addDoc(collection(db, "news"), {
      title,
      summary,
      imageUrl: imageUrl || "",
      createdAt: serverTimestamp(),
    });

    newsStatus.textContent = "发布成功！";
    newsStatus.classList.add("ok");
    newsTitle.value = "";
    newsSummary.value = "";
    newsImageUrl.value = "";

    loadNewsList(); // 刷新列表
  } catch (err) {
    console.error(err);
    newsStatus.textContent = "发布失败：" + err.message;
    newsStatus.classList.add("err");
  }
});

/* =============== 加载各类列表 =============== */

async function loadCollectionList(collectionName, targetElement, titleFieldGuess) {
  targetElement.textContent = "加载中…";

  try {
    const q = query(
      collection(db, collectionName),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      targetElement.textContent = "暂无数据。";
      return;
    }

    const table = document.createElement("table");
    table.className = "list-table";
    const thead = document.createElement("thead");
    thead.innerHTML = `
      <tr>
        <th style="width:40%;">标题 / 主要字段</th>
        <th style="width:35%;">摘要</th>
        <th style="width:25%;">操作</th>
      </tr>
    `;
    table.appendChild(thead);
    const tbody = document.createElement("tbody");

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const tr = document.createElement("tr");

      // 尝试找一个标题字段
      const title =
        data[titleFieldGuess] ||
        data.title ||
        data.subject ||
        data.name ||
        "(无明显标题)";

      const summary = (data.summary || data.content || JSON.stringify(data))
        .toString()
        .slice(0, 80);

      const created =
        data.createdAt && data.createdAt.toDate
          ? data.createdAt.toDate().toLocaleString("zh-CN", {
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })
          : "";

      tr.innerHTML = `
        <td>
          <div>${title}</div>
          <div class="muted">
            <span class="pill-id">${docSnap.id.slice(0, 8)}…</span>
            ${created ? " · " + created : ""}
          </div>
        </td>
        <td>${summary}</td>
        <td>
          <button class="btn btn-danger btn-sm" data-id="${docSnap.id}">删除</button>
        </td>
      `;

      const btn = tr.querySelector("button");
      btn.addEventListener("click", async () => {
        const ok = confirm(
          `确定要删除 ${collectionName} 中这条记录吗？\nID: ${docSnap.id}`
        );
        if (!ok) return;
        try {
          await deleteDoc(doc(db, collectionName, docSnap.id));
          btn.disabled = true;
          btn.textContent = "已删除";
        } catch (err) {
          alert("删除失败：" + err.message);
        }
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    targetElement.innerHTML = "";
    targetElement.appendChild(table);
  } catch (err) {
    console.error(err);
    targetElement.textContent = "加载失败：" + err.message;
  }
}

function loadNewsList() {
  loadCollectionList("news", newsListBox, "title");
}
function loadPostsList() {
  loadCollectionList("posts", postsListBox, "title");
}
function loadJobsList() {
  loadCollectionList("jobs", jobsListBox, "title");
}
function loadRentsList() {
  loadCollectionList("rents", rentsListBox, "title");
}
function loadCvsList() {
  loadCollectionList("cvs", cvsListBox, "name");
}

function loadAllLists() {
  loadNewsList();
  loadPostsList();
  loadJobsList();
  loadRentsList();
  loadCvsList();
}

reloadAllBtn.addEventListener("click", loadAllLists);
