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

const listEl = document.getElementById("newsList");

const modalEl = document.getElementById("newsModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalClose = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalMeta = document.getElementById("modalMeta");
const modalLead = document.getElementById("modalLead");
const modalHero = document.getElementById("modalHero");
const modalHeroImage = document.getElementById("modalHeroImage");
const modalBody = document.getElementById("modalBody");

const commentsInfo = document.getElementById("newsCommentsInfo");
const commentsList = document.getElementById("newsCommentsList");
const commentContentInput = document.getElementById("newsCommentContent");
const commentSubmitBtn = document.getElementById("newsCommentSubmit");
const commentStatus = document.getElementById("newsCommentStatus");

let newsItems = [];
let currentNewsId = null;

function setListLoading(msg) {
  listEl.innerHTML = `<p>${msg}</p>`;
}

function buildLegacyBlocks(item) {
  const blocks = [];

  if (item.body) {
    item.body
      .split(/\n\s*\n/g)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((text) => {
        blocks.push({ type: "paragraph", text });
      });
  }

  const images = Array.isArray(item.coverImages) ? item.coverImages : [];
  if (images.length > 1) {
    blocks.push({ type: "gallery", images: images.slice(1) });
  }

  return blocks;
}

function renderArticleBody(item) {
  modalBody.innerHTML = "";

  const blocks =
    Array.isArray(item.bodyBlocks) && item.bodyBlocks.length > 0
      ? item.bodyBlocks
      : buildLegacyBlocks(item);

  blocks.forEach((block) => {
    if (block.type === "paragraph") {
      const p = document.createElement("p");
      p.className = "article-paragraph";
      p.textContent = block.text || "";
      modalBody.appendChild(p);
      return;
    }

    if (block.type === "image" && block.url) {
      const wrap = document.createElement("div");
      wrap.className = "article-inline-image";

      const img = document.createElement("img");
      img.src = block.url;
      img.alt = "新闻插图";
      img.loading = "lazy";

      wrap.appendChild(img);
      modalBody.appendChild(wrap);
      return;
    }

    if (block.type === "gallery" && Array.isArray(block.images) && block.images.length) {
      const gallery = document.createElement("div");
      gallery.className = "article-gallery";

      block.images.forEach((src) => {
        const img = document.createElement("img");
        img.src = src;
        img.alt = "新闻图片";
        img.loading = "lazy";
        gallery.appendChild(img);
      });

      modalBody.appendChild(gallery);
    }
  });
}

function openModal(item) {
  currentNewsId = item.id || null;

  modalTitle.textContent = item.title || "";
  modalMeta.textContent = item.createdText || item.meta || "";
  modalLead.textContent = item.summary || "";

  const heroImage =
    Array.isArray(item.coverImages) && item.coverImages.length
      ? item.coverImages[0]
      : item.imageUrl || null;

  if (heroImage) {
    modalHero.style.display = "block";
    modalHeroImage.src = heroImage;
  } else {
    modalHero.style.display = "none";
    modalHeroImage.src = "";
  }

  renderArticleBody(item);

  if (currentNewsId) {
    loadNewsComments(currentNewsId);
  } else {
    commentsList.innerHTML = "";
    commentsInfo.textContent = "";
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

async function submitNewsComment() {
  if (!currentNewsId) {
    commentStatus.textContent = "未找到对应新闻，稍后重试。";
    commentStatus.style.color = "red";
    return;
  }

  const content = commentContentInput.value.trim();
  const name = "匿名";

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

if (commentSubmitBtn) {
  commentSubmitBtn.addEventListener("click", (e) => {
    e.preventDefault();
    submitNewsComment();
  });
}

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
      const coverImages = Array.isArray(data.coverImages) ? data.coverImages : [];
      const imageUrl = data.imageUrl || coverImages[0] || null;
      const bodyBlocks = Array.isArray(data.bodyBlocks) ? data.bodyBlocks : [];
      const createdText = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "时间未知";

      const itemData = {
        id,
        title,
        summary,
        body,
        coverImages,
        imageUrl,
        bodyBlocks,
        createdText,
      };
      newsItems.push(itemData);

      const itemEl = document.createElement("div");
      itemEl.className = "news-item";

      const textWrap = document.createElement("div");
      textWrap.className = "news-text";

      const titleEl = document.createElement("div");
      titleEl.className = "news-title";
      titleEl.textContent = title;

      const summaryEl = document.createElement("div");
      summaryEl.className = "news-summary";
      summaryEl.textContent = summary;

      const bottomRow = document.createElement("div");
      bottomRow.className = "news-meta-row";

      const metaEl = document.createElement("div");
      metaEl.className = "news-meta";
      metaEl.textContent = createdText;

      const shareBtn = document.createElement("button");
      shareBtn.type = "button";
      shareBtn.className = "news-share-btn";
      shareBtn.dataset.id = id;
      shareBtn.dataset.title = title;
      shareBtn.textContent = "分享";

      bottomRow.appendChild(metaEl);
      bottomRow.appendChild(shareBtn);

      textWrap.appendChild(titleEl);
      textWrap.appendChild(summaryEl);
      textWrap.appendChild(bottomRow);
      itemEl.appendChild(textWrap);

      if (imageUrl) {
        const imgWrap = document.createElement("div");
        imgWrap.className = "news-image";

        const img = document.createElement("img");
        img.src = imageUrl;
        img.alt = title;

        imgWrap.appendChild(img);
        itemEl.appendChild(imgWrap);
      }

      itemEl.addEventListener("click", () => {
        openModal(itemData);
      });

      listEl.appendChild(itemEl);
    });

    handleNewsDeepLink();
  } catch (err) {
    console.error("加载新闻失败：", err);
    setListLoading("加载失败，请稍后重试。");
  }
}

loadNews();