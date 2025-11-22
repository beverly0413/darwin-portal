await uploadBytes(storageRef, file);
imageUrl = await getDownloadURL(storageRef);
``` :contentReference[oaicite:0]{index=0}  

所以浏览器去访问：

`https://firebasestorage.googleapis.com/...` → 被 CORS 拦截 → 报错。

我们要做的是：  
> **前端不再直接访问 Firebase，只给 `/api/upload` 发请求。**

---

### 2. 你只需要做一件事：**用下面这份代码，完全替换 0466658664.js**

把你项目里的 `0466658664.js` 内容删掉，换成下面这一整份：

```js
// 0466658664.js  （前端改为调用 /api/upload，彻底不再直接访问 Firebase Storage）

import { db } from "./firebase.js";
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

// --- 工具函数：设置状态文本 ---
const titleEl = document.getElementById("newsTitle");
const summaryEl = document.getElementById("newsSummary");
const bodyEl = document.getElementById("newsBody");
const imageFileEl = document.getElementById("newsImageFile");
const publishBtn = document.getElementById("publishBtn");
const publishStatus = document.getElementById("publishStatus");

const refreshBtn = document.getElementById("refreshBtn");
const listEl = document.getElementById("newsList");
const emptyHint = document.getElementById("emptyHint");

function setStatus(el, msg, ok = false) {
  el.textContent = msg || "";
  el.classList.remove("status-ok", "status-error");
  if (!msg) return;
  el.classList.add(ok ? "status-ok" : "status-error");
}

// --- 新：通过后端 /api/upload 上传图片 ---
async function uploadImageViaApi(file) {
  const formData = new FormData();
  formData.append("file", file);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    let errMsg = "图片上传失败";
    try {
      const data = await res.json();
      if (data && data.error) errMsg = data.error;
    } catch (e) {
      // ignore
    }
    throw new Error(errMsg);
  }

  const data = await res.json();
  if (!data.url) {
    throw new Error("上传成功但未返回图片地址");
  }
  return data.url;
}

// --- 发布新闻（正文 + 可选图片） ---
publishBtn.addEventListener("click", async () => {
  const title = titleEl.value.trim();
  const summary = summaryEl.value.trim();
  const body = bodyEl.value.trim();
  const file = imageFileEl.files[0];

  if (!title || !summary || !body) {
    setStatus(publishStatus, "标题、摘要、正文都不能为空。");
    return;
  }

  publishBtn.disabled = true;
  setStatus(publishStatus, "正在发布…", true);

  try {
    let imageUrl = null;

    // 如果选择了图片：交给后端 /api/upload 处理
    if (file) {
      setStatus(publishStatus, "正在上传图片…", true);
      imageUrl = await uploadImageViaApi(file);
    }

    setStatus(publishStatus, "正在保存新闻内容…", true);

    await addDoc(collection(db, "news"), {
      title,
      summary,
      body,
      imageUrl, // 可能是 null
      createdAt: serverTimestamp(),
    });

    titleEl.value = "";
    summaryEl.value = "";
    bodyEl.value = "";
    imageFileEl.value = "";

    setStatus(publishStatus, "发布成功。", true);
    await loadNews();
  } catch (err) {
    console.error(err);
    setStatus(publishStatus, "发布失败：" + err.message);
  } finally {
    publishBtn.disabled = false;
  }
});

// --- 加载列表 ---
async function loadNews() {
  listEl.innerHTML = "";
  emptyHint.style.display = "none";

  try {
    const q = query(
      collection(db, "news"),
      orderBy("createdAt", "desc"),
      limit(30)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      emptyHint.style.display = "block";
      emptyHint.textContent = "暂无新闻。";
      return;
    }

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      const createdText = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "时间未知";

      const item = document.createElement("div");
      item.className = "item";

      const top = document.createElement("div");
      top.className = "item-top";

      const left = document.createElement("div");
      const titleDiv = document.createElement("div");
      titleDiv.className = "item-title";
      titleDiv.textContent = data.title || "(无标题)";
      const metaDiv = document.createElement("div");
      metaDiv.className = "item-meta";
      metaDiv.textContent = createdText;

      left.appendChild(titleDiv);
      left.appendChild(metaDiv);

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-sm btn-danger";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", async () => {
        if (!confirm("确定删除这条新闻吗？")) return;
        try {
          await deleteDoc(doc(db, "news", id));
          item.remove();
          if (!listEl.childElementCount) {
            emptyHint.style.display = "block";
          }
        } catch (err) {
          alert("删除失败：" + err.message);
        }
      });

      top.appendChild(left);
      top.appendChild(delBtn);

      const summaryDiv = document.createElement("div");
      summaryDiv.className = "item-meta";
      summaryDiv.textContent =
        (data.summary || "").slice(0, 60) +
        (data.summary && data.summary.length > 60 ? "…" : "");

      item.appendChild(top);
      item.appendChild(summaryDiv);

      listEl.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    emptyHint.style.display = "block";
    emptyHint.textContent = "加载失败：" + err.message;
  }
}

refreshBtn.addEventListener("click", loadNews);
loadNews();
