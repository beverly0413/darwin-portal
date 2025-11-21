// 0466658664.js
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

const titleEl = document.getElementById("newsTitle");
const summaryEl = document.getElementById("newsSummary");
const imageEl = document.getElementById("newsImage");
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

// 发布新闻
publishBtn.addEventListener("click", async () => {
  const title = titleEl.value.trim();
  const summary = summaryEl.value.trim();
  const imageUrl = imageEl.value.trim();

  if (!title || !summary) {
    setStatus(publishStatus, "标题和摘要不能为空。");
    return;
  }

  setStatus(publishStatus, "正在发布…", true);
  try {
    await addDoc(collection(db, "news"), {
      title,
      summary,
      imageUrl: imageUrl || null,
      createdAt: serverTimestamp(),
    });

    titleEl.value = "";
    summaryEl.value = "";
    imageEl.value = "";

    setStatus(publishStatus, "发布成功。", true);
    await loadNews();
  } catch (err) {
    console.error(err);
    setStatus(publishStatus, "发布失败：" + err.message);
  }
});

// 加载列表
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
      const titleDiv = document.createElement("div");
      titleDiv.className = "item-title";
      titleDiv.textContent = data.title || "(无标题)";
      const metaDiv = document.createElement("div");
      metaDiv.className = "item-meta";
      const createdText = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "时间未知";
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
      summaryDiv.textContent = data.summary || "";

      item.appendChild(top);
      if (summaryDiv.textContent) item.appendChild(summaryDiv);

      listEl.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    emptyHint.style.display = "block";
    emptyHint.textContent = "加载失败：" + err.message;
  }
}

refreshBtn.addEventListener("click", loadNews);
loadNews(); // 进入页面自动加载一次
