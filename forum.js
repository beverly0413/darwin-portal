// forum.js —— Supabase 论坛 + 点击帖子查看详情
// 表名：forum_posts

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

// File[] -> base64[]
function forumFilesToBase64(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const r = new FileReader();
          r.onload = (e) => resolve(e.target.result);
          r.readAsDataURL(file);
        })
    )
  );
}

// 小工具：格式化时间
function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ============= 详情弹窗 ============= */

function showForumDetail(post) {
  // 先移除旧弹窗
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
  card.style.maxWidth = "720px";
  card.style.width = "90%";
  card.style.maxHeight = "85vh";
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
  const dateStr = formatDate(post.created_at);
  metaEl.textContent = dateStr ? `发布于：${dateStr}` : "";
  metaEl.style.marginBottom = "10px";

  const contentEl = document.createElement("div");
  contentEl.style.fontSize = "14px";
  contentEl.style.color = "#111827";
  contentEl.style.lineHeight = "1.6";
  contentEl.style.whiteSpace = "pre-wrap";
  contentEl.textContent = post.content || "";

  const imagesWrapper = document.createElement("div");
  if (Array.isArray(post.images) && post.images.length > 0) {
    imagesWrapper.style.display = "grid";
    imagesWrapper.style.gridTemplateColumns =
      "repeat(auto-fill,minmax(120px,1fr))";
    imagesWrapper.style.gap = "10px";
    imagesWrapper.style.marginTop = "12px";

    post.images.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "帖子图片";
      img.style.width = "100%";
      img.style.borderRadius = "10px";
      img.style.objectFit = "cover";
      img.loading = "lazy";
      imagesWrapper.appendChild(img);
    });
  }

  card.appendChild(closeBtn);
  card.appendChild(titleEl);
  card.appendChild(metaEl);
  card.appendChild(contentEl);
  if (imagesWrapper.childElementCount > 0) {
    card.appendChild(imagesWrapper);
  }

  overlay.appendChild(card);

  // 点击遮罩关闭（点卡片不关闭）
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

/* ============= 图片预览（发帖时） ============= */

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

/* ============= 加载帖子列表 ============= */

async function loadForumPosts() {
  const list = document.getElementById("posts");
  if (!list) return;

  list.innerHTML = "加载中...";

  if (!ensureSupabase()) {
    list.textContent = "系统配置错误，无法加载数据。";
    return;
  }

  const { data, error } = await supabaseClient
    .from("forum_posts")
    .select("id, title, content, images, created_at")
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
    div.style.cursor = "pointer"; // 整卡可点击

    const dateStr = formatDate(p.created_at);

    let imgHtml = "";
    if (Array.isArray(p.images) && p.images.length > 0) {
      imgHtml = `
        <div class="forum-photos">
          ${p.images
            .map((url) => `<img src="${url}" alt="帖子图片">`)
            .join("")}
        </div>
      `;
    }

    // 摘要内容，太长就截断
    let summary = p.content || "";
    if (summary.length > 60) {
      summary = summary.slice(0, 60) + "…";
    }

    div.innerHTML = `
      <h3>${p.title}</h3>
      <p style="white-space:pre-wrap;margin-top:4px;">${summary}</p>
      ${imgHtml}
      <small style="color:#6b7280;display:block;margin-top:4px;">发布于：${dateStr}</small>
    `;

    // 点击帖子卡片 → 打开详情弹窗
    div.addEventListener("click", () => {
      showForumDetail(p);
    });

    list.appendChild(div);
  });
}

/* ============= 发帖表单逻辑 ============= */

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

    // 登录检查
    const { data: userData, error: userErr } =
      await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      alert("请先登录后再发布帖子。");
      window.location.href = "login.html";
      return;
    }
    const user = userData.user;

    // 转图片
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

/* ============= 初始化 ============= */

document.addEventListener("DOMContentLoaded", () => {
  loadForumPosts();
  setupForumForm();
});
