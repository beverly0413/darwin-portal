// forum.js —— Supabase 论坛：列表 + 详情弹窗（大图/保存）+ 评论 + 分享
// 帖子表：forum_posts
// 评论表：forum_comments

const FORUM_MAX_IMAGES = 5;
let forumImagesList = [];

// 检查 supabaseClient
function ensureSupabase() {
  if (!window.supabaseClient) {
    console.error("supabaseClient 未初始化，请检查公共配置脚本。");
    alert("系统配置错误：未找到 supabaseClient。");
    return false;
  }
  return true;
}

// 小工具：格式化日期
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

// File[] -> base64[]
function forumFilesToBase64(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const r = new FileReader();
          r.onload = (e) => resolve(e.target.result);
          r.onerror = reject;
          r.readAsDataURL(file);
        })
    )
  );
}

/* ============= 评论相关 ============= */

// 加载某个帖子的评论
async function loadComments(postId, listEl, infoEl) {
  if (!ensureSupabase()) return;

  listEl.innerHTML = "评论加载中...";

  const { data, error } = await supabaseClient
    .from("forum_comments")
    .select("id, content, user_email, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("加载评论失败：", error);
    listEl.textContent = "评论加载失败。";
    infoEl.textContent = "";
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<p style="font-size:13px;color:#9ca3af;">还没有评论，欢迎抢沙发。</p>';
    infoEl.textContent = "";
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
    meta.textContent = `${c.user_email || "匿名"} · ${formatDate(
      c.created_at
    )}`;

    const body = document.createElement("div");
    body.style.fontSize = "14px";
    body.style.color = "#111827";
    body.style.whiteSpace = "pre-wrap";
    body.textContent = c.content;

    item.appendChild(meta);
    item.appendChild(body);
    listEl.appendChild(item);
  });
}

// 提交评论
async function submitComment(postId, textarea, statusEl, listEl, infoEl) {
  const content = textarea.value.trim();
  if (!content) {
    statusEl.textContent = "评论内容不能为空。";
    statusEl.style.color = "red";
    return;
  }

  statusEl.textContent = "正在提交评论...";
  statusEl.style.color = "#6b7280";

  if (!ensureSupabase()) return;

  // 检查登录
  const { data: userData, error: userErr } =
    await supabaseClient.auth.getUser();
  if (userErr || !userData?.user) {
    alert("请先登录后再发表评论。");
    window.location.href = "login.html";
    return;
  }
  const user = userData.user;

  const { error } = await supabaseClient.from("forum_comments").insert({
    post_id: postId,
    content,
    user_id: user.id,
    user_email: user.email,
  });

  if (error) {
    console.error("发表评论失败：", error);
    statusEl.textContent = "发表评论失败，请稍后再试。";
    statusEl.style.color = "red";
    return;
  }

  textarea.value = "";
  statusEl.textContent = "评论已发表。";
  statusEl.style.color = "green";

  // 重新加载评论列表
  await loadComments(postId, listEl, infoEl);
}

/* ============= 详情弹窗（带图片保存 + 评论） ============= */

function showForumDetail(post) {
  const old = document.getElementById("forumDetailOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "forumDetailOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(15,23,42,0.45)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "1000";

  const card = document.createElement("div");
  card.style.maxWidth = "800px";
  card.style.width = "92%";
  card.style.maxHeight = "90vh";
  card.style.overflowY = "auto";
  card.style.background = "#ffffff";
  card.style.borderRadius = "16px";
  card.style.boxShadow = "0 20px 45px rgba(15,23,42,0.25)";
  card.style.padding = "20px 24px 24px";
  card.style.position = "relative";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.style.border = "none";
  closeBtn.style.background = "transparent";
  closeBtn.style.fontSize = "22px";
  closeBtn.style.cursor = "pointer";
  closeBtn.style.position = "absolute";
  closeBtn.style.top = "8px";
  closeBtn.style.right = "14px";
  closeBtn.onclick = () => overlay.remove();

  const titleEl = document.createElement("h2");
  titleEl.textContent = post.title || "未命名帖子";
  titleEl.style.margin = "0 0 6px 0";
  titleEl.style.fontSize = "18px";

  const metaEl = document.createElement("div");
  metaEl.style.fontSize = "13px";
  metaEl.style.color = "#6b7280";
  metaEl.style.marginBottom = "10px";
  const dateStr = formatDate(post.created_at);
  metaEl.textContent = dateStr ? `发布于：${dateStr}` : "";

  const contentEl = document.createElement("div");
  contentEl.style.fontSize = "14px";
  contentEl.style.color = "#111827";
  contentEl.style.lineHeight = "1.6";
  contentEl.style.whiteSpace = "pre-wrap";
  contentEl.textContent = post.content || "";

  // 图片区域：支持大图 + 保存
  const imagesWrapper = document.createElement("div");
  if (Array.isArray(post.images) && post.images.length > 0) {
    imagesWrapper.style.marginTop = "14px";
    imagesWrapper.style.display = "grid";
    imagesWrapper.style.gridTemplateColumns =
      "repeat(auto-fill,minmax(160px,1fr))";
    imagesWrapper.style.gap = "10px";

    post.images.forEach((src, idx) => {
      const box = document.createElement("div");
      box.style.borderRadius = "12px";
      box.style.border = "1px solid #e5e7eb";
      box.style.padding = "6px";
      box.style.background = "#f9fafb";
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.gap = "6px";
      box.style.alignItems = "stretch";

      const img = document.createElement("img");
      img.src = src;
      img.alt = "帖子图片";
      img.style.width = "100%";
      img.style.borderRadius = "8px";
      img.style.objectFit = "cover";
      img.loading = "lazy";

      const btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.justifyContent = "space-between";
      btnRow.style.gap = "4px";

      // 查看大图：在新标签打开
      const viewLink = document.createElement("a");
      viewLink.textContent = "查看大图";
      viewLink.href = src;
      viewLink.target = "_blank";
      viewLink.style.fontSize = "12px";
      viewLink.style.color = "#2563eb";
      viewLink.style.textDecoration = "none";

      // 保存图片：使用 download 属性
      const saveLink = document.createElement("a");
      saveLink.textContent = "保存图片";
      saveLink.href = src;
      saveLink.download = `forum-image-${post.id || "p"}-${idx + 1}.png`;
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

  /* ======= 评论区域 ======= */

  const commentBlock = document.createElement("div");
  commentBlock.style.marginTop = "18px";
  commentBlock.style.paddingTop = "12px";
  commentBlock.style.borderTop = "1px solid #e5e7eb";

  const commentTitle = document.createElement("h3");
  commentTitle.textContent = "评论";
  commentTitle.style.fontSize = "15px";
  commentTitle.style.margin = "0 0 6px 0";

  const commentInfo = document.createElement("div");
  commentInfo.style.fontSize = "12px";
  commentInfo.style.color = "#6b7280";
  commentInfo.style.marginBottom = "6px";

  const commentList = document.createElement("div");
  commentList.style.fontSize = "14px";

  // 发表评论区域
  const commentForm = document.createElement("div");
  commentForm.style.marginTop = "8px";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.placeholder = "写下你的评论...";
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

  submitBtn.addEventListener("click", async () => {
    await submitComment(
      post.id,
      textarea,
      statusSpan,
      commentList,
      commentInfo
    );
  });

  actionRow.appendChild(statusSpan);
  actionRow.appendChild(submitBtn);
  commentForm.appendChild(textarea);
  commentForm.appendChild(actionRow);

  commentBlock.appendChild(commentTitle);
  commentBlock.appendChild(commentInfo);
  commentBlock.appendChild(commentList);
  commentBlock.appendChild(commentForm);

  // 组装弹窗内容
  card.appendChild(closeBtn);
  card.appendChild(titleEl);
  card.appendChild(metaEl);
  card.appendChild(contentEl);
  if (imagesWrapper.childElementCount > 0) {
    card.appendChild(imagesWrapper);
  }
  card.appendChild(commentBlock);

  overlay.appendChild(card);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);

  // 打开弹窗后，立即加载评论
  loadComments(post.id, commentList, commentInfo);
}

/* ============= URL 深度链接：?forum=123 自动打开 ============= */

function handleForumDeepLink(posts) {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("forum");
    if (!id) return;

    const post = posts.find((p) => String(p.id) === String(id));
    if (!post) return;

    setTimeout(() => showForumDetail(post), 0);
  } catch (e) {
    console.error("解析 forum 参数失败：", e);
  }
}

/* ============= 列表展示（带分享按钮） ============= */

async function loadForumPosts() {
  const list = document.getElementById("posts");
  if (!list) return;

  list.innerHTML = "加载中...";

  if (!ensureSupabase()) {
    list.textContent = "系统配置错误，无法加载数据。";
    return;
  }
  // ✅ 加在这里
  const { data: userData } = await supabaseClient.auth.getUser();
  const currentUserId = userData?.user?.id || null;

  const { data, error } = await supabaseClient
    .from("forum_posts")
    .select("id, title, content, images, created_at, user_id")
    .order("created_at", { ascending: false });

  const { data, error } = await supabaseClient
    .from("forum_posts")
   .select("id, title, content, images, created_at, user_id")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("加载帖子失败：", error);
    list.textContent = "加载失败，请稍后再试。";
    return;
  }

  if (!data || data.length === 0) {
    list.innerHTML =
      `<div class="posts-empty">暂时还没有帖子，欢迎发布第一条。</div>`;
    return;
  }

  list.innerHTML = "";

  data.forEach((p) => {
    const div = document.createElement("div");
    div.className = "post-card";
    div.style.cursor = "pointer";

    const dateStr = formatDate(p.created_at);

    let imgHtml = "";
    if (Array.isArray(p.images) && p.images.length > 0) {
      imgHtml = `
        <div class="forum-photos">
          ${p.images
            .slice(0, 3)
            .map((url) => `<img src="${url}" alt="帖子图片">`)
            .join("")}
          ${
            p.images.length > 3
              ? `<span style="font-size:12px;color:#6b7280;margin-left:6px;">+${p.images.length - 3} 张</span>`
              : ""
          }
        </div>
      `;
    }

    let summary = p.content || "";
    if (summary.length > 60) summary = summary.slice(0, 60) + "…";

    div.innerHTML = `
      <h3>${p.title}</h3>
      <p style="white-space:pre-wrap;margin-top:4px;">${summary}</p>
      ${imgHtml}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;">
        <small style="color:#6b7280;display:block;">发布于：${dateStr}</small>
        <button
          class="forum-share-btn"
          type="button"
          data-id="${p.id}"
          data-title="${p.title || "论坛帖子"}"
          style="padding:4px 10px;border-radius:999px;border:1px solid #16a34a;background:#ffffff;color:#16a34a;font-size:12px;cursor:pointer;"
        >
          分享
        </button>
      </div>
    `;

// ✅ 仅本人发的帖子显示“删除”按钮
if (currentUserId && p.user_id === currentUserId) {
  const delBtn = document.createElement("button");
  delBtn.textContent = "删除";
  delBtn.type = "button";
  delBtn.style.padding = "4px 10px";
  delBtn.style.borderRadius = "999px";
  delBtn.style.border = "1px solid #dc2626";
  delBtn.style.background = "#fff";
  delBtn.style.color = "#dc2626";
  delBtn.style.fontSize = "12px";
  delBtn.style.cursor = "pointer";

  delBtn.onclick = async (e) => {
    e.stopPropagation(); // 防止点删除时打开帖子详情

    const ok = confirm("确定要删除这条帖子吗？");
    if (!ok) return;

    const { error } = await supabaseClient
      .from("forum_posts")
      .delete()
      .eq("id", p.id);

    if (error) {
      alert("删除失败：" + error.message);
      return;
    }

    // 重新加载列表
    loadForumPosts();
  };

  // 把按钮加到帖子卡片里
  div.appendChild(delBtn);
}

    // 点击整条帖子 → 打开详情（带评论）
    div.addEventListener("click", () => showForumDetail(p));

    list.appendChild(div);
  });

  // 处理 ?forum= 深度链接
  handleForumDeepLink(data);
}

/* ============= 发帖表单 ============= */

function updateForumPreview() {
  const preview = document.getElementById("forumPreview");
  if (!preview) return;

  preview.innerHTML = "";

  forumImagesList.forEach((file, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "preview-item";

    const img = document.createElement("img");
    img.style.width = "90px";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "8px";
    img.style.border = "1px solid #d1e5d4";

    const reader = new FileReader();
    reader.onload = (e) => (img.src = e.target.result);
    reader.readAsDataURL(file);

    const del = document.createElement("button");
    del.textContent = "×";
    del.type = "button";
    del.className = "preview-remove";
    del.onclick = () => {
      forumImagesList.splice(idx, 1);
      updateForumPreview();
    };

    wrap.appendChild(img);
    wrap.appendChild(del);
    preview.appendChild(wrap);
  });
}

function setupForumForm() {
  const form = document.getElementById("forumForm");
  const statusEl = document.getElementById("forumStatus");
  const input = document.getElementById("forumImages");
  const clearBtn = document.getElementById("forumClearImages");

  if (!form || !statusEl) return;

  if (input) {
    input.onchange = (e) => {
      const newFiles = Array.from(e.target.files || []);
      for (let file of newFiles) {
        if (forumImagesList.length >= FORUM_MAX_IMAGES) break;
        forumImagesList.push(file);
      }
      input.value = "";
      updateForumPreview();
    };
  }

  if (clearBtn) {
    clearBtn.onclick = () => {
      forumImagesList = [];
      updateForumPreview();
      if (input) input.value = "";
    };
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!ensureSupabase()) return;

    const title = document.getElementById("title").value.trim();
    const content = document.getElementById("content").value.trim();

    if (!title) {
      statusEl.textContent = "标题不能为空";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "发布中...";
    statusEl.style.color = "#6b7280";

    const { data: userData, error: userErr } =
      await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      alert("请先登录后再发布帖子。");
      window.location.href = "login.html";
      return;
    }
    const user = userData.user;

    let urls = [];
    try {
      urls = await forumFilesToBase64(
        forumImagesList.slice(0, FORUM_MAX_IMAGES)
      );
    } catch (err) {
      console.error("读取图片失败：", err);
      statusEl.textContent = "读取图片失败，请重试。";
      statusEl.style.color = "red";
      return;
    }

    const payload = {
      title,
      content,
      images: urls,
      user_id: user.id,
      user_email: user.email,
    };

    const { error } = await supabaseClient.from("forum_posts").insert(payload);

    if (error) {
      console.error("发布失败：", error);
      statusEl.textContent = "发布失败，请稍后再试。";
      statusEl.style.color = "red";
      return;
    }

    form.reset();
    forumImagesList = [];
    updateForumPreview();

    statusEl.textContent = "发布成功";
    statusEl.style.color = "green";

    loadForumPosts();
  };
}

/* ============= 分享功能：标题 + 链接 ============= */

async function shareForum(postId, postTitle) {
  const url =
    window.location.origin +
    window.location.pathname +
    "?forum=" +
    encodeURIComponent(postId);

  const safeTitle =
    postTitle && postTitle.trim() ? postTitle.trim() : "达尔文本地论坛帖子";

  const shareText = `【论坛】${safeTitle}\nDarwin BBS 帖子详情：`;

  // 1）系统分享
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

  // 2）复制：标题 + 链接
  const copyText = `【论坛】${safeTitle}\n查看详情：${url}`;
  try {
    await navigator.clipboard.writeText(copyText);
    alert("已复制：标题 + 链接，可以直接粘贴给好友。");
  } catch (err) {
    console.error("复制失败：", err);
    alert("请手动复制以下内容分享：\n\n" + copyText);
  }
}

// 事件代理：监听分享按钮（并阻止触发卡片点击）
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".forum-share-btn");
  if (!btn) return;

  e.stopPropagation();

  const postId = btn.dataset.id;
  const postTitle = btn.dataset.title || "论坛帖子";

  if (postId) {
    shareForum(postId, postTitle);
  }
});

/* ============= 初始化 ============= */

document.addEventListener("DOMContentLoaded", () => {
  loadForumPosts();
  setupForumForm();
});
