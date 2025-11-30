// news.js —— News 页面：列表 + 弹窗详情 + 分享 + 深度链接 + 评论
// 新闻集合：news
// 评论集合：news_comments（字段：newsId, content, name, createdAt）

import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
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

// 评论相关 DOM
const commentsWrap = document.getElementById("newsComments");
const commentsInfo = document.getElementById("newsCommentsInfo");
const commentsList = document.getElementById("newsCommentsList");
const commentNameInput = document.getElementById("newsCommentName");
const commentContentInput = document.getElementById("newsCommentContent");
const commentSubmitBtn = document.getElementById("newsCommentSubmit");
const commentStatus = document.getElementById("newsCommentStatus");

// 用于分享 & 深度链接的缓存
let newsItems = []; // { id, title, body, imageUrl, createdText }
let currentNewsId = null;

function setListLoading(msg) {
  listEl.innerHTML = `<p>${msg}</p>`;
}

// 打开 / 关闭弹窗
function openModal(item) {
  currentNewsId = item.id || null;

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

  // 每次打开弹窗时，加载对应新闻的评论
  if (currentNewsId) {
    loadNewsComments(currentNewsId);
  } else {
    // 没有 ID 时直接清空评论区
    if (commentsList) commentsList.innerHTML = "";
    if (commentsInfo) commentsInfo.textContent = "";
  }

  modalEl.classList.add("show");
}

function closeModal() {
  modalEl.classList.remove("show");
  currentNewsId = null;
}

modalClose?.addEventListener("click", closeModal);
modalBackdrop?.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

/* ========= 评论：读取 ========= */

async function loadNewsComments(newsId) {
  if (!commentsList || !commentsInfo) return;

  commentsList.innerHTML = "<p>评论加载中...</p>";
  commentsInfo.textContent = "";

  try {
    const qComments = query(
      collection(db, "news_comments"),
      where("newsId", "==", newsId),
      orderBy("createdAt", "asc")
    );
    const snap = await getDocs(qComments);

    if (snap.empty) {
      commentsList.innerHTML =
        '<p style="font-size:13px;color:#9ca3af;">还没有评论，欢迎第一个留言。</p>';
      commentsInfo.textContent = "";
      return;
    }

    commentsList.innerHTML = "";
    let count = 0;

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      count += 1;

      const name = data.name || "匿名";
      const content = data.content || "";
      const createdAt = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "";

      const itemEl = document.createElement("div");
      itemEl.className = "news-comment-item";

      const metaEl = document.createElement("div");
      metaEl.className = "news-comment-meta";
      metaEl.textContent = createdAt ? `${name} · ${createdAt}` : name;

      const contentEl = document.createElement("div");
      contentEl.className = "news-comment-content";
      contentEl.textContent = content;

      itemEl.appendChild(metaEl);
      itemEl.appendChild(contentEl);
      commentsList.appendChild(itemEl);
    });

    commentsInfo.textContent = `共 ${count} 条评论`;
  } catch (err) {
    console.error("加载新闻评论失败：", err);
    commentsList.innerHTML = "<p>评论加载失败。</p>";
    commentsInfo.textContent = "";
  }
}

/* ========= 评论：提交 ========= */

async function submitNewsComment() {
  if (!currentNewsId) {
    commentStatus.textContent = "未找到对应新闻，稍后重试。";
    commentStatus.style.color = "red";
    return;
  }

  const content = commentContentInput.value.trim();
  const name = commentNameInput.value.trim() || "匿名";

  if (!content) {
    commentStatus.textContent = "评论内容不能为空。";
    commentStatus.style.color = "red";
    return;
  }

  commentSubmitBtn.disabled = true;
  commentStatus.textContent = "正在提交评论...";
  commentStatus.style.color = "#6b7280";

  try {
    await addDoc(collection(db, "news_comments"), {
      newsId: currentNewsId,
      content,
      name,
      createdAt: serverTimestamp(),
    });

    commentContentInput.value = "";
    // 名字可以保留，不清空，方便同一个人多次评论
    commentStatus.textContent = "评论已发表。";
    commentStatus.style.color = "green";

    await loadNewsComments(currentNewsId);
  } catch (err) {
    console.error("发表评论失败：", err);
    commentStatus.textContent = "发表评论失败，请稍后重试。";
    commentStatus.style.color = "red";
  } finally {
    commentSubmitBtn.disabled = false;
  }
}

// 绑定评论按钮
if (commentSubmitBtn) {
  commentSubmitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    submitNewsComment();
  });
}

/* ========= 深度链接：?news=xxx ========= */

function handleNewsDeepLink() {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("news");
    if (!id) return;

    const item = newsItems.find((n) => n.id === id);
    if (!item) return;

    setTimeout(() => openModal(item), 0);
  } catch (err) {
    console.error("解析 news 参数失败：", err);
  }
}

/* ========= 分享功能：标题 + 链接 ========= */

async function shareNews(newsId, newsTitle) {
  const url =
    window.location.origin +
    window.location.pathname +
    "?news=" +
    encodeURIComponent(newsId);

  const safeTitle =
    newsTitle && newsTitle.trim() ? newsTitle.trim() : "达尔文本地新闻";

  const shareText = `【新闻】${safeTitle}\nDarwin BBS 新闻详情：`;

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
    }
  }

  const copyText = `【新闻】${safeTitle}\n查看详情：${url}`;
  try {
    await navigator.clipboard.writeText(copyText);
    alert("已复制：标题 + 链接，可以直接粘贴给好友。");
  } catch (err) {
    console.error("复制失败：", err);
    alert("请手动复制以下内容分享：\n\n" + copyText);
  }
}

// 事件代理：监听分享按钮
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".news-share-btn");
  if (!btn) return;

  e.stopPropagation();

  const newsId = btn.dataset.id;
  const newsTitle = btn.dataset.title || "达尔文本地新闻";

  if (newsId) {
    shareNews(newsId, newsTitle);
  }
});

/* ========= 从 Firestore 读取新闻列表 ========= */

async function loadNews() {
  try {
    setListLoading("加载中…");

    const qNews = query(collection(db, "news"), orderBy("createdAt", "desc"));
    const snap = await getDocs(qNews);

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

      const itemData = { id, title, summary, body, imageUrl, createdText };
      newsItems.push(itemData);

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

      // 底部：时间 + 分享按钮
      const bottomRow = document.createElement("div");
      bottomRow.style.display = "flex";
      bottomRow.style.justifyContent = "space-between";
      bottomRow.style.alignItems = "center";
      bottomRow.style.marginTop = "4px";

      const metaEl = document.createElement("div");
      metaEl.className = "news-meta";
      metaEl.textContent = createdText;

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

      // 点击整条新闻 → 打开详情弹窗 + 评论
      itemEl.addEventListener("click", () => {
        openModal(itemData);
      });

      listEl.appendChild(itemEl);
    });

    // 列表加载完后，看 URL 是否带 news=xxx
    handleNewsDeepLink();
  } catch (err) {
    console.error("加载新闻失败：", err);
    setListLoading("加载失败，请稍后重试。");
  }
}

// 页面加载时自动执行
loadNews();
