// forum.js
// Forum 页面：localStorage 保存文字，图片仅保存在内存

const STORAGE_KEY = "darwin_life_hub_forum_v2";
const MAX_IMAGES = 5;

let forumImagesList = [];  // 当前发布的图（File 数组）
let postsMemory = [];      // 当前所有帖子（含图片 DataURL）

// ========= 加载 / 保存文字 =========
function loadPostsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function savePostsTextOnly() {
  const textOnly = postsMemory.map(p => ({
    id: p.id,
    title: p.title,
    content: p.content,
    createdAt: p.createdAt,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnly));
}

// ========= 图片预览（支持单张删除） =========
function updateForumPreview() {
  const preview = document.getElementById("forumPreview");
  preview.innerHTML = "";

  forumImagesList.forEach((file, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "preview-item";

    const img = document.createElement("img");
    const reader = new FileReader();
    reader.onload = e => img.src = e.target.result;
    reader.readAsDataURL(file);

    const del = document.createElement("button");
    del.textContent = "×";
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
    files.map(file =>
      new Promise(res => {
        const r = new FileReader();
        r.onload = e => res(e.target.result);
        r.readAsDataURL(file);
      })
    )
  );
}

// ========= 渲染帖子 =========
function renderPosts() {
  const list = document.getElementById("posts");
  list.innerHTML = "";

  if (postsMemory.length === 0) {
    list.innerHTML = `<div class="posts-empty">暂时还没有帖子</div>`;
    return;
  }

  postsMemory.forEach(p => {
    const div = document.createElement("div");
    div.className = "post-card";

    const date = new Date(p.createdAt);
    const dateStr = `${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`;

    let imgHtml = "";
    if (Array.isArray(p.images)) {
      imgHtml = `
        <div class="forum-photos">
          ${p.images.map(url => `<img src="${url}">`).join("")}
        </div>`;
    }

    div.innerHTML = `
      <h3>${p.title}</h3>
      <p style="white-space:pre-wrap;">${p.content}</p>
      ${imgHtml}
      <small style="color:#6b7280">发布于：${dateStr}</small>
    `;
    list.appendChild(div);
  });
}

// ========= 设置表单 =========
function setupForm() {
  const form = document.getElementById("forumForm");
  const statusEl = document.getElementById("forumStatus");
  const input = document.getElementById("forumImages");

  // 多次选择图片 → 累加
  input.onchange = e => {
    const newFiles = Array.from(e.target.files);
    for (let file of newFiles) {
      if (forumImagesList.length >= MAX_IMAGES) break;
      forumImagesList.push(file);
    }
    input.value = "";
    updateForumPreview();
  };

  // 清空图片
  document.getElementById("forumClearImages").onclick = () => {
    forumImagesList = [];
    updateForumPreview();
  };

  form.onsubmit = async e => {
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

    // 把 File 装换成 DataURL
    const urls = await readFilesAsDataURL(forumImagesList);

    const newPost = {
      id: Date.now(),
      title,
      content,
      createdAt: new Date().toISOString(),
      images: urls,
    };

    postsMemory.unshift(newPost);
    savePostsTextOnly();
    renderPosts();

    // 清空状态
    form.reset();
    forumImagesList = [];
    updateForumPreview();

    statusEl.textContent = "发布成功";
    statusEl.style.color = "green";
  };
}

// ========= 初始化 =========
document.addEventListener("DOMContentLoaded", () => {
  postsMemory = loadPostsFromStorage();
  renderPosts();
  setupForm();
});
