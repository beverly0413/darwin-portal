// news.js  —— News 页面：读取 Firestore 里的 "news" 集合，显示列表 + 弹窗详情 + 分享 + 深度链接

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

// 用来支持 ?news=ID 深度链接
let newsItems = []; // { id, title, summary, body, imageUrl, createdText }

function setListLoading(msg) {
  listEl.innerHTML = `<p>${msg}</p>`;
}

// 打开 / 关闭弹窗
function openModal(item) {
  modalTitle.textContent = item.title || "";
  modalMeta.textContent = item.createdText || item.meta || "";
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

// 深度链接处理：?news=某个文档ID
function handleNewsDeepLink() {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("news");
    if (!id) return;

    const item = newsItems.find((n) => n.id === id);
    if (!item) return;

    // 保证列表都渲染好了再打开
    setTimeout(() => openModal(item), 0);
  } catch (err) {
    console.error("解析 news 参数失败：", err);
  }
}

/* ========== 分享功能：标题 + 链接 ========== */

async function shareNews(newsId, newsTitle) {
  const url =
    window.location.origin +
    window.location.pathname +
    "?news=" +
    encodeURIComponent(newsId);

  const safeTitle =
    newsTitle && newsTitle.trim() ? newsTitle.trim() : "达尔文本地新闻";

  const shareText = `【新闻】${safeTitle}\nDarwin BBS 新闻详情：`;

  // 1）优先使用系统分享（手机浏览器）
  if (navigator.share) {
    try {
      await navigator.share({
        title: safeTitle,
        text: shareText,
        url: url,
      });
      return;
    } catch (err) {
      console.error("系统分享失败：", err);
      // 继续走复制逻辑
    }
  }

  // 2）不支持系统分享：复制 标题 + 链接
  const copyText = `【新闻】${safeTitle}\n查看详情：${url}`;
  try {
    await navigator.clipboard.writeText(copyText);
    alert("已复制：标题 + 链接，可以直接粘贴给好友。");
  } catch (err) {
    console.error("复制失败：", err);
    alert("请手动复制以下内容分享：\n\n" + copyText);
  }
}

// 全局事件代理：监听分享按钮（避免触发整条新闻的点击事件）
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".news-share-btn");
  if (!btn) return;

  e.stopPropagation(); // 避免同时触发打开详情

  const newsId = btn.dataset.id;
  const newsTitle = btn.dataset.title || "达尔文本地新闻";

  if (newsId) {
    shareNews(newsId, newsTitle);
  }
});

/* ========== 从 Firestore 读取新闻列表 ========== */

async function loadNews() {
  try {
    setListLoading("加载中…");

    const q = query(collection(db, "news"), orderBy("createdAt", "desc"));
    const snap = await getDocs(q);

    if (snap.empty) {
      setListLoading("暂时还没有新闻。");
      return;
    }

    listEl.innerHTML = "";
    newsItems = [];

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;

      const title = data.title || "未命名新闻";
      const summary = data.summary || "";
      const body = data.body || "";
      const imageUrl = data.imageUrl || null;
      const createdText = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "时间未知";

      // 把数据存到数组中，方便深度链接打开
      newsItems.push({
        id,
        title,
        summary,
        body,
        imageUrl,
        createdText,
      });

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

      // 底部一行：时间 + 分享按钮
      const bottomRow = document.createElement("div");
      bottomRow.style.display = "flex";
      bottomRow.style.justifyContent = "space-between";
      bottomRow.style.alignItems = "center";
      bottomRow.style.marginTop = "4px";

      const shareBtn = document.createElement("button");
      shareBtn.type = "button";
      shareBtn.className = "news-share-btn";
      shareBtn.dataset.id = id;
      shareBtn.dataset.title = title;
      shareBtn.textContent = "分享";
      shareBtn.style.padding = "4px 10px";
      shareBtn.style.borderRadius = "999px";
      shareBtn.style.border = "1px solid #16a34a";
      shareBtn.style.background = "#ffffff";
      shareBtn.style.color = "#16a34a";
      shareBtn.style.fontSize = "12px";
      shareBtn.style.cursor = "pointer";

      bottomRow.appendChild(metaEl);
      bottomRow.appendChild(shareBtn);

      textWrap.appendChild(titleEl);
      textWrap.appendChild(summaryEl);
      textWrap.appendChild(bottomRow);

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

      // 点击整条新闻 → 打开弹窗
      itemEl.addEventListener("click", () => {
        openModal({
          title,
          body,
          imageUrl,
          createdText,
        });
      });

      listEl.appendChild(itemEl);
    });

    // 列表加载完后，检查 URL 是否带有 ?news=xxx
    handleNewsDeepLink();
  } catch (err) {
    console.error("加载新闻失败：", err);
    setListLoading("加载失败，请稍后重试。");
  }
}

// 页面加载时自动执行
loadNews();
