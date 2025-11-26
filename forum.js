// forum.js —— 使用 Supabase 存储论坛帖子
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

// 图片预览
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

// 加载帖子
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

    const date = p.created_at ? new Date(p.created_at) : new Date();
    const dateStr = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    let imgHtml = "";
    if (Array.isArray(p.images) && p.images.length > 0) {
      imgHtml = `
        <div class="forum-photos">
          ${p.images.map((url) => `<img src="${url}" alt="帖子图片">`).join("")}
        </div>
      `;
    }

    div.innerHTML = `
      <h3>${p.title}</h3>
      <p style="white-space:pre-wrap;">${p.content}</p>
      ${imgHtml}
      <small style="color:#6b7280;display:block;margin-top:4px;">发布于：${dateStr}</small>
    `;
    list.appendChild(div);
  });
}

// 表单逻辑
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

document.addEventListener("DOMContentLoaded", () => {
  loadForumPosts();
  setupForumForm();
});
