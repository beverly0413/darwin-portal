// admin.js
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---- DOM ----
const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const adminEmailEl = document.getElementById("adminEmail");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");
const logoutBtn = document.getElementById("logoutBtn");

const newsTitle = document.getElementById("newsTitle");
const newsSummary = document.getElementById("newsSummary");
const newsImage = document.getElementById("newsImage");
const newsContent = document.getElementById("newsContent");
const publishNewsBtn = document.getElementById("publishNewsBtn");
const newsStatus = document.getElementById("newsStatus");

const newsList = document.getElementById("newsList");
const newsListEmpty = document.getElementById("newsListEmpty");
const refreshNewsBtn = document.getElementById("refreshNewsBtn");

const refreshAllBtn = document.getElementById("refreshAllBtn");
const jobsList = document.getElementById("jobsList");
const jobsListEmpty = document.getElementById("jobsListEmpty");
const rentsList = document.getElementById("rentsList");
const rentsListEmpty = document.getElementById("rentsListEmpty");
const postsList = document.getElementById("postsList");
const postsListEmpty = document.getElementById("postsListEmpty");
const cvsList = document.getElementById("cvsList");
const cvsListEmpty = document.getElementById("cvsListEmpty");

function setStatus(el, message, ok = false) {
  el.textContent = message || "";
  el.classList.remove("status-error", "status-ok");
  if (!message) return;
  el.classList.add(ok ? "status-ok" : "status-error");
}

// ---- Auth 状态切换 ----
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    adminSection.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    adminEmailEl.textContent = user.email || "";
    loginStatus.textContent = "";
    loadNews();
    loadAllCollections();
  } else {
    loginSection.classList.remove("hidden");
    adminSection.classList.add("hidden");
    logoutBtn.classList.add("hidden");
    adminEmailEl.textContent = "";
  }
});

// ---- 登录 ----
loginBtn.addEventListener("click", async () => {
  const email = loginEmail.value.trim();
  const password = loginPassword.value;

  if (!email || !password) {
    setStatus(loginStatus, "请输入邮箱和密码。");
    return;
  }

  setStatus(loginStatus, "正在登录，请稍候…", true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    setStatus(loginStatus, "登录成功。", true);
  } catch (err) {
    console.error(err);
    setStatus(loginStatus, `登录失败：${err.code || err.message}`);
  }
});

// ---- 退出登录 ----
logoutBtn.addEventListener("click", async () => {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
  }
});

// ---- 发布新闻 ----
publishNewsBtn.addEventListener("click", async () => {
  const title = newsTitle.value.trim();
  const summary = newsSummary.value.trim();
  const imageUrl = newsImage.value.trim();
  const content = newsContent.value.trim();

  if (!title || !summary) {
    setStatus(newsStatus, "标题和摘要不能为空。");
    return;
  }

  setStatus(newsStatus, "正在发布新闻…", true);
  try {
    await addDoc(collection(db, "news"), {
      title,
      summary,
      imageUrl: imageUrl || null,
      content: content || null,
      createdAt: serverTimestamp(),
    });
    setStatus(newsStatus, "发布成功。", true);

    // 清空表单
    newsTitle.value = "";
    newsSummary.value = "";
    newsImage.value = "";
    newsContent.value = "";

    // 重新加载列表
    await loadNews();
  } catch (err) {
    console.error(err);
    setStatus(newsStatus, `发布失败：${err.message}`);
  }
});

// ---- 读取新闻列表 ----
async function loadNews() {
  newsList.innerHTML = "";
  newsListEmpty.classList.add("hidden");

  try {
    const q = query(
      collection(db, "news"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      newsListEmpty.classList.remove("hidden");
      return;
    }

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      const item = document.createElement("div");
      item.className = "item";

      const top = document.createElement("div");
      top.className = "item-top";

      const left = document.createElement("div");
      const titleEl = document.createElement("div");
      titleEl.className = "item-title";
      titleEl.textContent = data.title || "(无标题)";
      const metaEl = document.createElement("div");
      metaEl.className = "item-meta";
      const created = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "时间未知";
      metaEl.textContent = created;
      left.appendChild(titleEl);
      left.appendChild(metaEl);

      const btn = document.createElement("button");
      btn.className = "btn btn-sm";
      btn.textContent = "删除";
      btn.addEventListener("click", async () => {
        if (!confirm("确定要删除这条新闻吗？")) return;
        try {
          await deleteDoc(doc(db, "news", id));
          item.remove();
        } catch (err) {
          alert("删除失败：" + err.message);
        }
      });

      top.appendChild(left);
      top.appendChild(btn);

      const summaryEl = document.createElement("div");
      summaryEl.className = "item-meta";
      summaryEl.textContent = data.summary || "";

      item.appendChild(top);
      item.appendChild(summaryEl);
      newsList.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    newsListEmpty.classList.remove("hidden");
    newsListEmpty.textContent = "加载新闻失败：" + err.message;
  }
}

refreshNewsBtn.addEventListener("click", loadNews);

// ---- 通用：载入集合（jobs / rents / posts / cvs） ----
async function loadCollectionShort(collectionName, listEl, emptyEl) {
  listEl.innerHTML = "";
  emptyEl.classList.add("hidden");

  try {
    const q = query(
      collection(db, collectionName),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      emptyEl.classList.remove("hidden");
      return;
    }

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      const item = document.createElement("div");
      item.className = "item";

      const top = document.createElement("div");
      top.className = "item-top";

      const left = document.createElement("div");
      const titleEl = document.createElement("div");
      titleEl.className = "item-title";
      titleEl.textContent =
        data.title || data.subject || data.name || "(未填写标题)";
      const metaEl = document.createElement("div");
      metaEl.className = "item-meta";
      const created = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "";
      metaEl.textContent = `${created} · ID: ${id}`;
      left.appendChild(titleEl);
      left.appendChild(metaEl);

      const btn = document.createElement("button");
      btn.className = "btn btn-sm";
      btn.textContent = "删除";
      btn.addEventListener("click", async () => {
        if (!confirm(`确定从 ${collectionName} 删除该记录吗？`)) return;
        try {
          await deleteDoc(doc(db, collectionName, id));
          item.remove();
        } catch (err) {
          alert("删除失败：" + err.message);
        }
      });

      top.appendChild(left);
      top.appendChild(btn);

      const extra = document.createElement("div");
      extra.className = "item-meta";
      extra.textContent =
        data.summary || data.description || data.content || "";

      item.appendChild(top);
      if (extra.textContent) item.appendChild(extra);
      listEl.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    emptyEl.classList.remove("hidden");
    emptyEl.textContent = `加载 ${collectionName} 失败：${err.message}`;
  }
}

async function loadAllCollections() {
  await Promise.all([
    loadCollectionShort("jobs", jobsList, jobsListEmpty),
    loadCollectionShort("rents", rentsList, rentsListEmpty),
    loadCollectionShort("posts", postsList, postsListEmpty),
    loadCollectionShort("cvs", cvsList, cvsListEmpty),
  ]);
}

refreshAllBtn.addEventListener("click", loadAllCollections);
