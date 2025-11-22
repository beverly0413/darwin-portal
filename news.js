// news.js  —— 前台 News 页面：读取 Firestore 里的 "news" 集合，并显示列表 + 弹窗详情

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// 列表和弹窗相关 DOM
const listEl = document.getElementById("newsList");

const modalEl = document.getElementById("newsModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalMeta = document.getElementById("modalMeta");
const modalImageWrap = document.getElementById("modalImageWrap");
const modalImage = document.getElementById("modalImage");
const modalBody = document.getElementById("modalBody");

function setListLoading(msg) {
  listEl.innerHTML = `<p>${msg}</p>`;
}

// 打开 / 关闭弹窗
function openModal(item) {
  modalTitle.textContent = item.title || "";
  modalMeta.textContent = item.meta || "";
  modalBody.textContent = item.body || "";

  if (item.imageUrl) {
    modalImageWrap.style.display = "block";
    modalImage.src = item.imageUrl;
  } else {
    modalImageWrap.style.display = "none";
    modalImage.src = "";
  }

  modalEl.classList.add("show");
}

function closeModal() {
  modalEl.classList.remove("show");
}

modalClose?.addEventListener("click", closeModal);
modalBackdrop?.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

// 从 Firestore 读取新闻
async function loadNews() {
  try {
    setListLoading("加载中…");

    const q = query(
      collection(db, "news"),
      orderBy("createdAt", "desc")
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      setListLoading("暂时还没有新闻。");
      return;
    }

    listEl.innerHTML = "";

    snap.forEach((docSnap) => {
      const data = docSnap.data();

      const title = data.title || "未命名新闻";
      const summary = data.summary || "";
      const body = data.body || "";
      const imageUrl = data.imageUrl || null;
      const createdText = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "时间未知";

      // 外层容器
      const itemEl = document.createElement("div");
      itemEl.className = "news-item";

      // 左侧文字区域
      const textWrap = document.createElement("div");
      textWrap.className = "news-text";

      const titleEl = document.createElement("div");
      titleEl.className = "news-title";
      titleEl.textContent = title;

      const summaryEl = document.createElement("div");
      summaryEl.className = "news-summary";
      summaryEl.textContent = summary;

      const metaEl = document.createElement("div");
      metaEl.className = "news-meta";
      metaEl.textContent = createdText;

      textWrap.appendChild(titleEl);
      textWrap.appendChild(summaryEl);
      textWrap.appendChild(metaEl);

      itemEl.appendChild(textWrap);

      // 右侧图片（如果有）
      if (imageUrl) {
        const imgWrap = document.createElement("div");
        imgWrap.className = "news-image";
        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = title;
        imgWrap.appendChild(img);
        itemEl.appendChild(imgWrap);
      }

      // 点击打开弹窗
      itemEl.addEventListener("click", () => {
        openModal({
          title,
          body,
          imageUrl,
          meta: createdText,
        });
      });

      listEl.appendChild(itemEl);
    });
  } catch (err) {
    console.error("加载新闻失败：", err);
    setListLoading("加载失败，请稍后重试。");
  }
}

// 页面加载时自动执行
loadNews();
