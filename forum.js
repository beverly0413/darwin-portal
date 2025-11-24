// forum.js
// Forum 页面：localStorage 保存帖子（文字 + 图片），发布时需要登录

const STORAGE_KEY = "darwin_life_hub_forum_v3";
const MAX_IMAGES = 5;

let forumImagesList = [];  // 当前准备发布的图片（File 数组）
let postsMemory = [];      // 当前所有帖子（含图片 DataURL）

/* ========= localStorage 读写 ========= */

// 读帖子（含图片）
function loadPostsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("读取论坛数据失败:", e);
    return [];
  }
}

// 写帖子（含图片）
function savePostsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(postsMemory));
  } catch (e) {
    console.error("保存论坛数据失败:", e);
  }
}

/* ========= 图片预览（支持单张删除） ========= */

function updateForumPreview() {
  const preview = document.getElementById("forumPreview");
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

// File[] → DataURL[]
function readFilesAsDataURL(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((res) => {
          const r = new FileReader();
          r.onload = (e) => res(e.target.result);
          r.readAsDataURL(file);
        })
    )
  );
}

/* ========= 渲染帖子 ========= */

function renderPosts() {
  const list = document.getElementById("posts");
  list.innerHTML = "";

  if (!postsMemory || postsMemory.length === 0) {
    list.innerHTML = `<div class="posts-empty">暂时还没有帖子，欢迎发布第一条。</div>`;
    return;
  }

  // 按时间倒序
  const sorted = [...postsMemory].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  sorted.forEach((p) => {
    const div = document.createElement("div");
    div.className = "post-card";

    const date = new Date(p.createdAt);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;

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

/* ========= 表单逻辑（发布前检查登录） ========= */

function setupForm() {
  const form = document.getElementById("forumForm");
  const statusEl = document.getElementById("forumStatus");
  const input = document.getElementById("forumImages");
  const clearBtn = document.getElementById("forumClearImages");

  // 选择图片（可多次选择，累加，最多 5 张）
  if (input) {
    input.onchange = (e) => {
      const newFiles = Array.from(e.target.files || []);
      for (let file of newFiles) {
        if (forumImagesList.length >= MAX_IMAGES) break;
        forumImagesList.push(file);
      }
      input.value = "";
      updateForumPreview();
    };
  }

  // 清空图片
  if (clearBtn) {
    clearBtn.onclick = () => {
      forumImagesList = [];
      updateForumPreview();
      if (input) input.value = "";
    };
  }

  form.onsubmit = async (e) => {
    e.preventDefault();

    const title = document.getElementById("title").value.trim();
    const content = document.getElementById("content").value.trim();

    if (!title) {
      statusEl.textContent = "标题不能为空";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "发布中...";
    statusEl.style.color = "#6b7280";

    // ✨ 1. 发布前检查是否登录（和 jobs / rent 一样）
    try {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data?.user) {
        alert("请先登录后再发布帖子。");
        window.location.href = "login.html";
        return;
      }
    } catch (err) {
      console.error("检查登录状态失败:", err);
      alert("登录状态异常，请重新登录。");
      window.location.href = "login.html";
      return;
    }

    // ✨ 2. 把 File 转成 base64，存进 localStorage
    const urls = await readFilesAsDataURL(forumImagesList);

    const newPost = {
      id: Date.now(),
      title,
      content,
      createdAt: new Date().toISOString(),
      images: urls, // base64 数组
    };

    postsMemory.push(newPost);
    savePostsToStorage();
    renderPosts();

    // ✨ 3. 清空状态
    form.reset();
    forumImagesList = [];
    updateForumPreview();

    statusEl.textContent = "发布成功";
    statusEl.style.color = "green";
  };
}

/* ========= 初始化：任何人都能看帖子 ========= */

document.addEventListener("DOMContentLoaded", () => {
  postsMemory = loadPostsFromStorage();
  renderPosts();
  setupForm();
});
