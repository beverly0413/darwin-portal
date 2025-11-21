// admin.js
import { auth, db } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  collection,
  addDoc,
  query,
  orderBy,
  limit,
  getDocs,
  serverTimestamp,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---- DOM ----
const loginSection = document.getElementById("loginSection");
const adminSection = document.getElementById("adminSection");
const adminEmailEl = document.getElementById("adminEmail");
const logoutBtn = document.getElementById("logoutBtn");

const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginBtn = document.getElementById("loginBtn");
const loginStatus = document.getElementById("loginStatus");

const newsTitle = document.getElementById("newsTitle");
const newsSummary = document.getElementById("newsSummary");
const newsImage = document.getElementById("newsImage");
const publishNewsBtn = document.getElementById("publishNewsBtn");
const newsStatus = document.getElementById("newsStatus");

const newsList = document.getElementById("newsList");
const newsListEmpty = document.getElementById("newsListEmpty");
const refreshNewsBtn = document.getElementById("refreshNewsBtn");

const deleteSelfBtn = document.getElementById("deleteSelfBtn");
const deleteSelfStatus = document.getElementById("deleteSelfStatus");

function setStatus(el, msg, ok = false) {
  el.textContent = msg || "";
  el.classList.remove("status-ok", "status-error");
  if (!msg) return;
  el.classList.add(ok ? "status-ok" : "status-error");
}

// ---- Auth 状态监听 ----
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    adminSection.classList.remove("hidden");
    logoutBtn.classList.remove("hidden");
    adminEmailEl.textContent = user.email || "";
    setStatus(loginStatus, "");
    loadNews();
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

  if (!title || !summary) {
    setStatus(newsStatus, "标题和摘要不能为空。");
    return;
  }

  setStatus(newsStatus, "正在发布…", true);
  try {
    await addDoc(collection(db, "news"), {
      title,
      summary,
      imageUrl: imageUrl || null,
      createdAt: serverTimestamp(),
    });

    newsTitle.value = "";
    newsSummary.value = "";
    newsImage.value = "";

    setStatus(newsStatus, "发布成功。", true);
    await loadNews();
  } catch (err) {
    console.error(err);
    setStatus(newsStatus, `发布失败：${err.message}`);
  }
});

// ---- 加载新闻列表 ----
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
      const createdText = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "时间未知";
      metaEl.textContent = createdText;
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
          if (!newsList.childElementCount) {
            newsListEmpty.classList.remove("hidden");
          }
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
      if (summaryEl.textContent) item.appendChild(summaryEl);
      newsList.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    newsListEmpty.classList.remove("hidden");
    newsListEmpty.textContent = "加载新闻失败：" + err.message;
  }
}

refreshNewsBtn.addEventListener("click", loadNews);

// ---- 删除当前登录账号 ----
deleteSelfBtn.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) {
    setStatus(deleteSelfStatus, "当前没有登录用户。");
    return;
  }

  if (!confirm("确定要永久删除当前账号吗？此操作不可恢复。")) return;

  // Firebase 要求删除前“最近登录”，这里简单让用户重新输入密码
  const email = user.email;
  const password = prompt("为安全起见，请再次输入当前账号的密码：", "");
  if (!password) {
    setStatus(deleteSelfStatus, "已取消删除操作。");
    return;
  }

  setStatus(deleteSelfStatus, "正在重新验证并删除账号…", true);

  try {
    const credential = EmailAuthProvider.credential(email, password);
    await reauthenticateWithCredential(user, credential);
    await deleteUser(user);
    setStatus(deleteSelfStatus, "账号已删除。", true);
  } catch (err) {
    console.error(err);
    setStatus(deleteSelfStatus, `删除失败：${err.code || err.message}`);
  }
});
