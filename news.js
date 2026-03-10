import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  where,
  serverTimestamp,
  doc,
  updateDoc,
  increment,
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

const modalViews = document.getElementById("modalViews");
const modalLikes = document.getElementById("modalLikes");
const modalCommentsCount = document.getElementById("modalCommentsCount");
const likeBtn = document.getElementById("likeBtn");

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

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function isLikelySubheading(text) {
  if (!text) return false;
  const clean = text.trim();
  if (clean.length < 4 || clean.length > 26) return false;
  if (/[。！？.!?]/.test(clean)) return false;
  if (/\n/.test(clean)) return false;
  return true;
}

function isLikelyQuote(text) {
  if (!text) return false;
  const clean = text.trim();
  return (
    (clean.startsWith("“") && clean.endsWith("”")) ||
    (clean.startsWith('"') && clean.endsWith('"')) ||
    clean.startsWith("他说") ||
    clean.startsWith("她说") ||
    clean.startsWith("他表示") ||
    clean.startsWith("她表示")
  );
}

function isLikelyList(text) {
  if (!text) return false;
  const lines = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  if (lines.length < 2) return false;

  return lines.every((line) => {
    return (
      /^[-•·▪‣]\s+/.test(line) ||
      /^\d+[.)、]\s+/.test(line) ||
      /^[（(]?\d+[）)]\s+/.test(line)
    );
  });
}

function renderListBlock(text) {
  const ul = document.createElement("ul");
  ul.className = "article-list";

  text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((line) => {
      const li = document.createElement("li");
      li.textContent = line.replace(/^([-•·▪‣]|\d+[.)、]|[（(]?\d+[）)])\s+/, "");
      ul.appendChild(li);
    });

  modalBody.appendChild(ul);
}

function renderParagraph(text, isFirstParagraph = false) {
  const p = document.createElement("p");
  p.className = "article-paragraph";
  if (isFirstParagraph) p.classList.add("article-first-paragraph");
  p.textContent = text || "";
  modalBody.appendChild(p);
}

function renderSubheading(text) {
  const h = document.createElement("div");
  h.className = "article-subheading";
  h.textContent = text || "";
  modalBody.appendChild(h);
}

function renderQuote(text) {
  const q = document.createElement("blockquote");
  q.className = "article-quote";
  q.textContent = text || "";
  modalBody.appendChild(q);
}

function renderDivider() {
  const hr = document.createElement("hr");
  hr.className = "article-divider";
  modalBody.appendChild(hr);
}

function renderArticleBody(item) {
  modalBody.innerHTML = "";

  const blocks =
    Array.isArray(item.bodyBlocks) && item.bodyBlocks.length > 0
      ? item.bodyBlocks
      : buildLegacyBlocks(item);

  let paragraphCount = 0;

  blocks.forEach((block) => {
    if (block.type === "paragraph") {
      const text = (block.text || "").trim();
      if (!text) return;

      if (/^[-—–]{3,}$/.test(text) || /^_{3,}$/.test(text) || /^={3,}$/.test(text)) {
        renderDivider();
        return;
      }

      if (isLikelyList(text)) {
        renderListBlock(text);
        return;
      }

      if (isLikelySubheading(text)) {
        renderSubheading(text);
        return;
      }

      if (isLikelyQuote(text)) {
        renderQuote(text);
        return;
      }

      paragraphCount += 1;
      renderParagraph(text, paragraphCount === 1);
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

async function increaseView(newsId) {
  if (!newsId) return;

  try {
    const ref = doc(db, "news", newsId);
    await updateDoc(ref, {
      views: increment(1),
    });

    const current = newsItems.find((n) => n.id === newsId);
    if (current) {
      current.views = (current.views || 0) + 1;
      modalViews.textContent = current.views;
      refreshListStats(newsId);
    }
  } catch (e) {
    console.error("view update fail", e);
  }
}

async function increaseLike(newsId) {
  if (!newsId) return;

  try {
    const ref = doc(db, "news", newsId);
    await updateDoc(ref, {
      likes: increment(1),
    });

    const current = newsItems.find((n) => n.id === newsId);
    if (current) {
      current.likes = (current.likes || 0) + 1;
      modalLikes.textContent = current.likes;
      refreshListStats(newsId);
    }
  } catch (e) {
    console.error("like update fail", e);
  }
}

function refreshListStats(newsId) {
  const item = newsItems.find((n) => n.id === newsId);
  if (!item) return;

  const row = document.querySelector(`.news-item[data-id="${newsId}"]`);
  if (!row) return;

  const viewsEl = row.querySelector(".stat-views");
  const likesEl = row.querySelector(".stat-likes");
  const commentsEl = row.querySelector(".stat-comments");

  if (viewsEl) viewsEl.textContent = item.views || 0;
  if (likesEl) likesEl.textContent = item.likes || 0;
  if (commentsEl) commentsEl.textContent = item.commentsCount || 0;
}

function openModal(item) {
  currentNewsId = item.id || null;

  modalTitle.textContent = item.title || "";
  modalMeta.textContent = item.createdText || item.meta || "";
  modalLead.textContent = item.summary || "";
  modalViews.textContent = item.views || 0;
  modalLikes.textContent = item.likes || 0;
  modalCommentsCount.textContent = item.commentsCount || 0;

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
    increaseView(currentNewsId);
    loadNewsComments(currentNewsId);
  } else {
    commentsList.innerHTML = "";
    commentsInfo.textContent = "";
  }

  modalEl.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeModal() {
  modalEl.classList.remove("show");
  currentNewsId = null;
  document.body.style.overflow = "";
}

modalClose?.addEventListener("click", closeModal);
modalBackdrop?.addEventListener("click", closeModal);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

if (likeBtn) {
  likeBtn.addEventListener("click", async (e) => {
    e.preventDefault();
    if (!currentNewsId) return;
    likeBtn.disabled = true;
    await increaseLike(currentNewsId);
    likeBtn.disabled = false;
  });
}

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
        '<p style="font-size:13px;color:#9c9387;">还没有评论，欢迎第一个留言。</p>';
      commentsInfo.textContent = "";
      modalCommentsCount.textContent = "0";
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
    modalCommentsCount.textContent = count;

    const current = newsItems.find((n) => n.id === newsId);
    if (current) {
      current.commentsCount = count;
      refreshListStats(newsId);
    }
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

    await updateDoc(doc(db, "news", currentNewsId), {
      commentsCount: increment(1),
    });

    const current = newsItems.find((n) => n.id === currentNewsId);
    if (current) {
      current.commentsCount = (current.commentsCount || 0) + 1;
      modalCommentsCount.textContent = current.commentsCount;
      refreshListStats(currentNewsId);
    }

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

function buildSummary(summary, body) {
  const s = (summary || "").trim();
  if (s) return s;

  const b = (body || "").trim().replace(/\s+/g, " ");
  if (!b) return "";

  return b.length > 120 ? b.slice(0, 120) + "…" : b;
}

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
      const body = data.body || "";
      const summary = buildSummary(data.summary || "", body);
      const coverImages = Array.isArray(data.coverImages) ? data.coverImages : [];
      const imageUrl = data.imageUrl || coverImages[0] || null;
      const bodyBlocks = Array.isArray(data.bodyBlocks) ? data.bodyBlocks : [];
      const createdText = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "时间未知";

      const views = data.views || 0;
      const likes = data.likes || 0;
      const commentsCount = data.commentsCount || 0;

      const itemData = {
        id,
        title,
        summary,
        body,
        coverImages,
        imageUrl,
        bodyBlocks,
        createdText,
        views,
        likes,
        commentsCount,
      };
      newsItems.push(itemData);

      const itemEl = document.createElement("div");
      itemEl.className = "news-item";
      itemEl.dataset.id = id;

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

      const leftWrap = document.createElement("div");
      leftWrap.className = "news-meta-left";

      const metaEl = document.createElement("div");
      metaEl.className = "news-meta";
      metaEl.textContent = createdText;

      const statsEl = document.createElement("div");
      statsEl.className = "news-stats";
      statsEl.innerHTML = `
        <span class="news-stat">👁 <span class="stat-views">${views}</span></span>
        <span class="news-stat">👍 <span class="stat-likes">${likes}</span></span>
        <span class="news-stat">💬 <span class="stat-comments">${commentsCount}</span></span>
      `;

      leftWrap.appendChild(metaEl);
      leftWrap.appendChild(statsEl);

      const shareBtn = document.createElement("button");
      shareBtn.type = "button";
      shareBtn.className = "news-share-btn";
      shareBtn.dataset.id = id;
      shareBtn.dataset.title = title;
      shareBtn.textContent = "分享";

      bottomRow.appendChild(leftWrap);
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
        img.loading = "lazy";

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