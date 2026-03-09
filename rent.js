// rent.js —— Supabase 版租房：列表 + 详情弹窗 + 阅读量 + 点赞 + 评论 + 发布 + 分享
// 表：rent_posts、rent_comments

const MAX_IMAGES = 5;
let rentImagesList = [];
let allRentsCache = [];
let currentRentDetailId = null;

// ================= 工具函数 =================

function ensureSupabase() {
  if (!window.supabaseClient) {
    console.error("supabaseClient 未初始化，请检查公共 supabase 配置脚本。");
    alert("系统配置错误：未找到 supabaseClient。");
    return false;
  }
  return true;
}

function filesToBase64(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function getUserNickname(user) {
  if (!ensureSupabase() || !user?.id) return "Darwin用户";

  try {
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("nickname")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("读取昵称失败：", error);
      return "Darwin用户";
    }

    if (data?.nickname && String(data.nickname).trim()) {
      return String(data.nickname).trim();
    }

    return "Darwin用户";
  } catch (err) {
    console.error("获取昵称异常：", err);
    return "Darwin用户";
  }
}

function findRentInCache(rentId) {
  return allRentsCache.find((r) => String(r.id) === String(rentId));
}

function updateRentInCache(rentId, patch) {
  const item = findRentInCache(rentId);
  if (!item) return null;
  Object.assign(item, patch);
  return item;
}

function refreshRentCardStats(rentId) {
  const rent = findRentInCache(rentId);
  if (!rent) return;

  const card = document.querySelector(`.rent-card[data-id="${rentId}"]`);
  if (!card) return;

  const viewsEl = card.querySelector(".rent-stat-views");
  const likesEl = card.querySelector(".rent-stat-likes");
  const commentsEl = card.querySelector(".rent-stat-comments");

  if (viewsEl) viewsEl.textContent = rent.views || 0;
  if (likesEl) likesEl.textContent = rent.likes || 0;
  if (commentsEl) commentsEl.textContent = rent.comments_count || 0;
}

function updateDetailStats(rent) {
  const viewsEl = document.getElementById("rentDetailViews");
  const likesEl = document.getElementById("rentDetailLikes");
  const commentsEl = document.getElementById("rentDetailComments");

  if (viewsEl) viewsEl.textContent = rent.views || 0;
  if (likesEl) likesEl.textContent = rent.likes || 0;
  if (commentsEl) commentsEl.textContent = rent.comments_count || 0;
}

async function increaseRentView(rentId) {
  if (!ensureSupabase() || !rentId) return;

  const rent = findRentInCache(rentId);
  if (!rent) return;

  const nextViews = (rent.views || 0) + 1;

  const { error } = await supabaseClient
    .from("rent_posts")
    .update({ views: nextViews })
    .eq("id", rentId);

  if (error) {
    console.error("更新阅读量失败：", error);
    return;
  }

  updateRentInCache(rentId, { views: nextViews });
  refreshRentCardStats(rentId);

  if (String(currentRentDetailId) === String(rentId)) {
    updateDetailStats(findRentInCache(rentId));
  }
}

async function increaseRentLike(rentId) {
  if (!ensureSupabase() || !rentId) return false;

  const rent = findRentInCache(rentId);
  if (!rent) return false;

  const nextLikes = (rent.likes || 0) + 1;

  const { error } = await supabaseClient
    .from("rent_posts")
    .update({ likes: nextLikes })
    .eq("id", rentId);

  if (error) {
    console.error("更新点赞量失败：", error);
    return false;
  }

  updateRentInCache(rentId, { likes: nextLikes });
  refreshRentCardStats(rentId);

  if (String(currentRentDetailId) === String(rentId)) {
    updateDetailStats(findRentInCache(rentId));
  }

  return true;
}

async function increaseRentCommentsCount(rentId) {
  if (!ensureSupabase() || !rentId) return false;

  const rent = findRentInCache(rentId);
  if (!rent) return false;

  const nextCount = (rent.comments_count || 0) + 1;

  const { error } = await supabaseClient
    .from("rent_posts")
    .update({ comments_count: nextCount })
    .eq("id", rentId);

  if (error) {
    console.error("更新评论数失败：", error);
    return false;
  }

  updateRentInCache(rentId, { comments_count: nextCount });
  refreshRentCardStats(rentId);

  if (String(currentRentDetailId) === String(rentId)) {
    updateDetailStats(findRentInCache(rentId));
  }

  return true;
}

/* ================= 评论相关：rent_comments ================= */

async function loadRentComments(postId, listEl, infoEl) {
  if (!ensureSupabase()) return;

  listEl.innerHTML = "评论加载中...";

  const { data, error } = await supabaseClient
    .from("rent_comments")
    .select("id, content, nickname, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("加载租房评论失败：", error);
    listEl.textContent = "评论加载失败。";
    infoEl.textContent = "";
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<p style="font-size:13px;color:#9ca3af;">还没有评论，欢迎第一个留言。</p>';
    infoEl.textContent = "";

    const cached = updateRentInCache(postId, { comments_count: 0 });
    if (cached) {
      refreshRentCardStats(postId);
      updateDetailStats(cached);
    }
    return;
  }

  listEl.innerHTML = "";
  infoEl.textContent = `共 ${data.length} 条评论`;

  data.forEach((c) => {
    const item = document.createElement("div");
    item.style.padding = "6px 0";
    item.style.borderBottom = "1px dashed #e5e7eb";

    const meta = document.createElement("div");
    meta.style.fontSize = "12px";
    meta.style.color = "#6b7280";
    meta.textContent = `${c.nickname || "Darwin用户"} · ${formatDate(c.created_at)}`;

    const body = document.createElement("div");
    body.style.fontSize = "14px";
    body.style.color = "#111827";
    body.style.whiteSpace = "pre-wrap";
    body.style.lineHeight = "1.7";
    body.textContent = c.content;

    item.appendChild(meta);
    item.appendChild(body);
    listEl.appendChild(item);
  });

  const cached = updateRentInCache(postId, { comments_count: data.length });
  if (cached) {
    refreshRentCardStats(postId);
    updateDetailStats(cached);
  }
}

async function submitRentComment(postId, textarea, statusEl, listEl, infoEl) {
  const content = textarea.value.trim();
  if (!content) {
    statusEl.textContent = "评论内容不能为空。";
    statusEl.style.color = "red";
    return;
  }

  if (!ensureSupabase()) return;

  statusEl.textContent = "正在提交评论...";
  statusEl.style.color = "#6b7280";

  const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
  if (userErr || !userData?.user) {
    alert("请先登录后再发表评论。");
    window.location.href = "login.html";
    return;
  }

  const user = userData.user;
  const nickname = await getUserNickname(user);

  const { error } = await supabaseClient.from("rent_comments").insert({
    post_id: postId,
    content,
    user_id: user.id,
    user_email: user.email,
    nickname: nickname,
  });

  if (error) {
    console.error("发表评论失败：", error);
    statusEl.textContent = "发表评论失败，请稍后再试。";
    statusEl.style.color = "red";
    return;
  }

  await increaseRentCommentsCount(postId);

  textarea.value = "";
  statusEl.textContent = "评论已发表。";
  statusEl.style.color = "green";

  await loadRentComments(postId, listEl, infoEl);
}

/* ================= 详情弹窗 ================= */

function showRentDetail(rent) {
  const old = document.getElementById("rentDetailOverlay");
  if (old) old.remove();

  currentRentDetailId = rent.id;

  const overlay = document.createElement("div");
  overlay.id = "rentDetailOverlay";
  overlay.className = "rent-detail-overlay";

  const card = document.createElement("div");
  card.className = "rent-detail-card";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.className = "rent-detail-close";
  closeBtn.onclick = () => {
    currentRentDetailId = null;
    overlay.remove();
  };

  const titleEl = document.createElement("h2");
  titleEl.textContent = rent.title || "未命名房源";
  titleEl.style.margin = "0 0 8px 0";
  titleEl.style.fontSize = "22px";
  titleEl.style.color = "#0f172a";

  const metaEl = document.createElement("div");
  metaEl.style.fontSize = "13px";
  metaEl.style.color = "#6b7280";
  metaEl.style.marginBottom = "6px";
  metaEl.textContent = rent.created_at ? `发布于：${formatDate(rent.created_at)}` : "";

  const statsBar = document.createElement("div");
  statsBar.className = "rent-detail-stats";
  statsBar.innerHTML = `
    <span class="rent-detail-stat">👁 阅读 <strong id="rentDetailViews">${rent.views || 0}</strong></span>
    <button id="rentDetailLikeBtn" class="rent-detail-stat rent-like-btn" type="button">👍 点赞 <strong id="rentDetailLikes">${rent.likes || 0}</strong></button>
    <span class="rent-detail-stat">💬 评论 <strong id="rentDetailComments">${rent.comments_count || 0}</strong></span>
  `;

  const infoEl = document.createElement("div");
  infoEl.style.fontSize = "14px";
  infoEl.style.color = "#111827";
  infoEl.style.lineHeight = "1.8";
  infoEl.innerHTML = `
    <p><strong>联系方式：</strong>${escapeHtml(rent.contact || "未填写")}</p>
    ${
      rent.content
        ? `<p style="margin-top:8px;white-space:pre-wrap;">${escapeHtml(rent.content)}</p>`
        : ""
    }
  `;

  const imagesWrapper = document.createElement("div");
  if (Array.isArray(rent.images) && rent.images.length > 0) {
    imagesWrapper.style.marginTop = "14px";
    imagesWrapper.style.display = "grid";
    imagesWrapper.style.gridTemplateColumns = "repeat(auto-fill,minmax(160px,1fr))";
    imagesWrapper.style.gap = "10px";

    rent.images.forEach((src, idx) => {
      const box = document.createElement("div");
      box.style.borderRadius = "12px";
      box.style.border = "1px solid #e5e7eb";
      box.style.padding = "6px";
      box.style.background = "#f9fafb";
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.gap = "6px";

      const img = document.createElement("img");
      img.src = src;
      img.alt = "房源图片";
      img.style.width = "100%";
      img.style.borderRadius = "8px";
      img.style.objectFit = "cover";
      img.loading = "lazy";

      const btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.justifyContent = "space-between";
      btnRow.style.gap = "4px";

      const viewLink = document.createElement("a");
      viewLink.textContent = "查看大图";
      viewLink.href = src;
      viewLink.target = "_blank";
      viewLink.style.fontSize = "12px";
      viewLink.style.color = "#2563eb";
      viewLink.style.textDecoration = "none";

      const saveLink = document.createElement("a");
      saveLink.textContent = "保存图片";
      saveLink.href = src;
      saveLink.download = `rent-image-${rent.id || "p"}-${idx + 1}.png`;
      saveLink.style.fontSize = "12px";
      saveLink.style.color = "#16a34a";
      saveLink.style.textDecoration = "none";

      btnRow.appendChild(viewLink);
      btnRow.appendChild(saveLink);

      box.appendChild(img);
      box.appendChild(btnRow);
      imagesWrapper.appendChild(box);
    });
  }

  const commentBlock = document.createElement("div");
  commentBlock.className = "rent-comments-block";

  const commentTitle = document.createElement("h3");
  commentTitle.textContent = "评论";
  commentTitle.style.fontSize = "16px";
  commentTitle.style.margin = "0 0 6px 0";

  const commentInfo = document.createElement("div");
  commentInfo.style.fontSize = "12px";
  commentInfo.style.color = "#6b7280";
  commentInfo.style.marginBottom = "6px";

  const commentList = document.createElement("div");
  commentList.className = "rent-comments-list";

  const commentForm = document.createElement("div");
  commentForm.style.marginTop = "8px";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.placeholder = "写下你的评论，例如：房子还在吗？";
  textarea.style.width = "100%";
  textarea.style.boxSizing = "border-box";
  textarea.style.resize = "vertical";
  textarea.style.borderRadius = "8px";
  textarea.style.border = "1px solid #d1d5db";
  textarea.style.padding = "6px 8px";
  textarea.style.fontSize = "14px";

  const actionRow = document.createElement("div");
  actionRow.style.display = "flex";
  actionRow.style.justifyContent = "space-between";
  actionRow.style.alignItems = "center";
  actionRow.style.marginTop = "6px";

  const statusSpan = document.createElement("span");
  statusSpan.style.fontSize = "12px";
  statusSpan.style.color = "#6b7280";

  const submitBtn = document.createElement("button");
  submitBtn.textContent = "发表评论";
  submitBtn.type = "button";
  submitBtn.style.border = "none";
  submitBtn.style.borderRadius = "999px";
  submitBtn.style.padding = "6px 14px";
  submitBtn.style.fontSize = "13px";
  submitBtn.style.cursor = "pointer";
  submitBtn.style.background = "#16a34a";
  submitBtn.style.color = "#ffffff";

  submitBtn.addEventListener("click", () =>
    submitRentComment(rent.id, textarea, statusSpan, commentList, commentInfo)
  );

  actionRow.appendChild(statusSpan);
  actionRow.appendChild(submitBtn);
  commentForm.appendChild(textarea);
  commentForm.appendChild(actionRow);

  commentBlock.appendChild(commentTitle);
  commentBlock.appendChild(commentInfo);
  commentBlock.appendChild(commentList);
  commentBlock.appendChild(commentForm);

  card.appendChild(closeBtn);
  card.appendChild(titleEl);
  card.appendChild(metaEl);
  card.appendChild(statsBar);
  card.appendChild(infoEl);
  if (imagesWrapper.childElementCount > 0) card.appendChild(imagesWrapper);
  card.appendChild(commentBlock);

  overlay.appendChild(card);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      currentRentDetailId = null;
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);

  const likeBtn = document.getElementById("rentDetailLikeBtn");
  if (likeBtn) {
    likeBtn.addEventListener("click", async () => {
      likeBtn.disabled = true;
      await increaseRentLike(rent.id);
      likeBtn.disabled = false;
    });
  }

  loadRentComments(rent.id, commentList, commentInfo);
  increaseRentView(rent.id);
}

/* ================= URL 深度链接 ================= */

function handleRentDeepLink(rents) {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("rent");
    if (!id) return;

    const rent = rents.find((r) => String(r.id) === String(id));
    if (!rent) return;

    setTimeout(() => showRentDetail(rent), 0);
  } catch (e) {
    console.error("解析 rent 参数失败：", e);
  }
}

/* ================= 列表 ================= */

async function loadRents() {
  const listEl = document.getElementById("rentList");
  if (!listEl) return;

  listEl.innerHTML = "加载中...";

  if (!ensureSupabase()) {
    listEl.textContent = "系统配置错误，无法加载数据。";
    return;
  }

  const { data, error } = await supabaseClient
    .from("rent_posts")
    .select("id, title, contact, content, images, created_at, views, likes, comments_count")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("加载租房列表失败：", error);
    listEl.textContent = "加载失败，请稍后再试。";
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<p style="color:#6b7280;font-size:13px;">目前还没有租房信息，欢迎成为第一位发布者。</p>';
    return;
  }

  allRentsCache = data.map((rent) => ({
    ...rent,
    views: rent.views || 0,
    likes: rent.likes || 0,
    comments_count: rent.comments_count || 0,
  }));

  listEl.innerHTML = "";

  allRentsCache.forEach((rent) => {
    const div = document.createElement("div");
    div.className = "rent-card";
    div.dataset.id = rent.id;

    const createdAt = rent.created_at ? new Date(rent.created_at) : new Date();
    const dateStr = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

    let summary = rent.content || "";
    if (summary.length > 80) summary = summary.slice(0, 80) + "…";

    let imagesHtml = "";
    if (Array.isArray(rent.images) && rent.images.length > 0) {
      imagesHtml = `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin:8px 0;">
          ${rent.images
            .slice(0, 3)
            .map(
              (src) => `
                <img src="${src}" style="width:120px;height:120px;object-fit:cover;border-radius:8px;border:1px solid #e5e7eb;">
              `
            )
            .join("")}
          ${
            rent.images.length > 3
              ? `<span style="font-size:12px;color:#6b7280;margin-left:6px;align-self:center;">+${rent.images.length - 3} 张</span>`
              : ""
          }
        </div>
      `;
    }

    div.innerHTML = `
      <h3 class="rent-card-title">${escapeHtml(rent.title || "未命名房源")}</h3>
      <p style="margin:2px 0;"><strong>联系方式：</strong>${escapeHtml(rent.contact || "未填写")}</p>
      ${summary ? `<p class="rent-summary">${escapeHtml(summary)}</p>` : ""}
      ${imagesHtml}
      <div class="rent-meta-row">
        <div class="rent-meta-left">
          <small style="color:#6b7280;">发布于：${dateStr}</small>
          <div class="rent-stats">
            <span class="rent-stat">👁 <span class="rent-stat-views">${rent.views || 0}</span></span>
            <span class="rent-stat">👍 <span class="rent-stat-likes">${rent.likes || 0}</span></span>
            <span class="rent-stat">💬 <span class="rent-stat-comments">${rent.comments_count || 0}</span></span>
          </div>
        </div>
        <button
          class="rent-share-btn"
          type="button"
          data-id="${rent.id}"
          data-title="${escapeHtml(rent.title || "房源信息")}"
        >
          分享
        </button>
      </div>
    `;

    div.addEventListener("click", () => showRentDetail(rent));
    listEl.appendChild(div);
  });

  handleRentDeepLink(allRentsCache);
}

/* ================= 图片预览 ================= */

function updateRentPreview() {
  const previewEl = document.getElementById("rentPreview");
  if (!previewEl) return;

  previewEl.innerHTML = "";

  rentImagesList.forEach((file, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";
    wrapper.style.marginRight = "6px";

    const img = document.createElement("img");
    img.style.width = "90px";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "8px";
    img.style.border = "1px solid #d1e5d4";

    const reader = new FileReader();
    reader.onload = (e) => (img.src = e.target.result);
    reader.readAsDataURL(file);

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.type = "button";
    btn.className = "preview-remove";
    btn.addEventListener("click", () => {
      rentImagesList.splice(idx, 1);
      updateRentPreview();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(btn);
    previewEl.appendChild(wrapper);
  });
}

/* ================= 发布表单 ================= */

function setupRentForm() {
  const form = document.getElementById("rentForm");
  const statusEl = document.getElementById("rentStatus");
  const input = document.getElementById("rentImages");
  const clearBtn = document.getElementById("rentClearImages");

  if (!form || !statusEl) return;

  if (input) {
    input.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        if (rentImagesList.length < MAX_IMAGES) {
          rentImagesList.push(f);
        }
      }
      input.value = "";
      updateRentPreview();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      rentImagesList = [];
      updateRentPreview();
      if (input) input.value = "";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureSupabase()) return;

    const title = document.getElementById("rentTitle").value.trim();
    const contact = document.getElementById("rentContact").value.trim();
    const content = document.getElementById("rentContent").value.trim();

    if (!title || !contact) {
      statusEl.textContent = "标题和联系方式是必填项。";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "提交中...";
    statusEl.style.color = "#6b7280";

    const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      alert("请先登录后再发布房源信息。");
      window.location.href = "login.html";
      return;
    }

    const user = userData.user;

    let imagesBase64 = [];
    try {
      imagesBase64 = await filesToBase64(rentImagesList.slice(0, MAX_IMAGES));
    } catch (err) {
      console.error("读取图片失败：", err);
      statusEl.textContent = "读取图片失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    const payload = {
      title,
      contact,
      content,
      images: imagesBase64,
      user_id: user.id,
      user_email: user.email,
      views: 0,
      likes: 0,
      comments_count: 0,
    };

    const { error } = await supabaseClient.from("rent_posts").insert(payload);

    if (error) {
      console.error("发布失败：", error);
      statusEl.textContent = "发布失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "发布成功！";
    statusEl.style.color = "green";

    form.reset();
    rentImagesList = [];
    updateRentPreview();
    loadRents();
  });
}

/* ================= 分享功能 ================= */

async function shareRent(rentId, rentTitle) {
  const url =
    window.location.origin +
    window.location.pathname +
    "?rent=" +
    encodeURIComponent(rentId);

  const safeTitle = rentTitle && rentTitle.trim()
    ? rentTitle.trim()
    : "达尔文租房信息";

  const shareText = `【租房】${safeTitle}\n达尔文BBS 房源详情：`;

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

  const copyText = `【租房】${safeTitle}\n查看详情：${url}`;
  try {
    await navigator.clipboard.writeText(copyText);
    alert("已复制：标题 + 链接，可以直接粘贴给好友。");
  } catch (err) {
    console.error("复制失败：", err);
    alert("请手动复制以下内容分享：\n\n" + copyText);
  }
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".rent-share-btn");
  if (!btn) return;

  e.stopPropagation();

  const rentId = btn.dataset.id;
  const rentTitle = btn.dataset.title || "房源信息";

  if (rentId) {
    shareRent(rentId, rentTitle);
  }
});

/* ================= 初始化 ================= */

document.addEventListener("DOMContentLoaded", () => {
  loadRents();
  setupRentForm();
});