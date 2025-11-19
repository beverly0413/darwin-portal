// news.js

// 只从 firebase.js 拿到 db
import { db } from "./firebase.js";

// 其他 Firestore 方法，直接从官方 CDN 引入
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

async function loadNews() {
  const listEl = document.getElementById("newsList");
  listEl.innerHTML = "<p>加载中…</p>";

  try {
    const q = query(collection(db, "news"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      listEl.innerHTML = "<p>暂无新闻</p>";
      return;
    }

    listEl.innerHTML = "";

    snapshot.forEach((doc) => {
      const data = doc.data();

      const createdText = data.createdAt
        ? data.createdAt.toDate().toLocaleDateString("zh-CN")
        : "";

      const item = document.createElement("div");
      item.className = "news-item";
      item.innerHTML = `
        <div class="news-text">
          <h3 class="news-title">${data.title || "未命名新闻"}</h3>
          <p class="news-summary">${data.summary || ""}</p>
          <div class="news-meta">${createdText}</div>
        </div>
        <div class="news-image">
          <img src="${data.imageUrl || "https://via.placeholder.com/400x260?text=News"}" alt="news image">
        </div>
      `;
      listEl.appendChild(item);
    });
  } catch (error) {
    console.error(error);
    listEl.innerHTML = "加载失败：" + error.message;
  }
}

loadNews();
