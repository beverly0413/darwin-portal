// my.js —— 汇总 job、cv、rent、forum 四个页面里“自己发布的帖子”（localStorage 版本）

const supabase = window.supabaseClient || null;

// 对应各页面 js 中的 STORAGE_KEY
const STORAGE_KEYS = {
  jobs:  "darwin_life_hub_jobs_v2",   // jobs.js
  cvs:   "darwin_life_hub_cvs_v2",    // cv.js
  rent:  "darwin_life_hub_rent_v1",   // rent.js
  forum: "darwin_life_hub_forum_v3",  // forum.js
};

// 显示用中文标签
const TYPE_LABELS = {
  jobs:  "招聘",
  cvs:   "求职",
  rent:  "租房",
  forum: "论坛",
};

let currentUser = null;
let myPosts = [];

/** 通用：读取某个 storage 的帖子数组，并打上类型标记 */
function loadPostsFromStorage(storageKey, typeKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];

    return arr.map((post) => ({
      ...post,
      _typeKey: typeKey,
      _typeLabel: TYPE_LABELS[typeKey] || typeKey,
      _storageKey: storageKey,
    }));
  } catch {
    return [];
  }
}

/** 渲染“我的”列表 */
function renderMyPosts() {
  const listEl = document.getElementById("myJobsList");
  const statusEl = document.getElementById("myJobsStatus");

  if (!listEl || !statusEl) return;

  listEl.innerHTML = "";

  if (!currentUser) {
    statusEl.textContent = "未检测到用户登录信息，请刷新页面重试。";
    return;
  }

  if (!myPosts || myPosts.length === 0) {
    statusEl.textContent = "你在招聘、求职、租房、论坛中还没有发布任何信息。";
    return;
  }

  statusEl.textContent = `你在四个板块共发布了 ${myPosts.length} 条信息。`;

  myPosts.forEach((post) => {
    const div = document.createElement("div");
    div.className = "job-item";

    const title = post.title || "未命名";
    const contact =
      post.contact || post.contactWay || post.phone || "";
    const content = post.content || post.body || "";

    const createdAtRaw =
      post.createdAt || post.created_at || post.date || new Date().toISOString();
    const createdAt = new Date(createdAtRaw);
    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

    let imagesHtml = "";
    if (Array.isArray(post.images) && post.images.length > 0) {
      imagesHtml = `
        <div class="job-photos">
          ${post.images.map((img) => `<img src="${img}" />`).join("")}
        </div>`;
    }

    div.innerHTML = `
      <h3>[${post._typeLabel || "其他"}] ${title}</h3>
      ${contact ? `<p><strong>联系方式：</strong>${contact}</p>` : ""}
      ${content ? `<p style="white-space:pre-wrap;">${content}</p>` : ""}
      ${imagesHtml}
      <div class="job-meta">发布于：${dateStr}</div>
    `;

    // 删除按钮
    const actions = document.createElement("div");
    actions.className = "job-actions";

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "删除";

    delBtn.addEventListener("click", () => {
      if (!confirm("确认删除这条信息吗？")) return;

      const storageKey = post._storageKey;

      // 删除对应 storage 中的记录
      try {
        const raw = localStorage.getItem(storageKey);
        let arr = [];
        if (raw) {
          const parsed = JSON.parse(raw);
          arr = Array.isArray(parsed) ? parsed : [];
        }
        const newArr = arr.filter((item) => item.id !== post.id);
        localStorage.setItem(storageKey, JSON.stringify(newArr));
      } catch (e) {
        console.error("删除 localStorage 记录失败：", e);
      }

      // 删除内存中的记录并重新渲染
      myPosts = myPosts.filter(
        (p) => !(p._storageKey === storageKey && p.id === post.id)
      );
      renderMyPosts();
    });

    actions.appendChild(delBtn);
    div.appendChild(actions);
    listEl.appendChild(div);
  });
}

/** 读取四个板块中“当前用户”的所有帖子 */
function loadAllMyPosts() {
  const allPosts = [];

  Object.entries(STORAGE_KEYS).forEach(([typeKey, storageKey]) => {
    if (!storageKey) return;
    const arr = loadPostsFromStorage(storageKey, typeKey);
    allPosts.push(...arr);
  });

  const uid = currentUser.id;
  const email = currentUser.email;

  myPosts = allPosts.filter((post) => {
    return (
      post.userId === uid ||
      post.user_id === uid ||
      post.ownerId === uid ||
      post.owner_id === uid ||
      post.userEmail === email ||
      post.user_email === email ||
      post.email === email
    );
  });

  myPosts.sort((a, b) => {
    const t1 = new Date(
      a.createdAt || a.created_at || a.date || "1970-01-01"
    ).getTime();
    const t2 = new Date(
      b.createdAt || b.created_at || b.date || "1970-01-01"
    ).getTime();
    return t2 - t1;
  });

  renderMyPosts();
}

/** 初始化“我的”页面 */
async function initMyPage() {
  const userInfoEl = document.getElementById("userInfo");
  const logoutBtn = document.getElementById("logoutBtn");

  if (!supabase) {
    alert("登录模块加载失败，请稍后刷新重试。");
    if (userInfoEl) {
      userInfoEl.textContent = "系统错误：无法初始化登录模块。";
    }
    return;
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      alert("请先登录后再访问“我的”页面。");
      window.location.href = "login.html";
      return;
    }

    currentUser = data.user;
    if (userInfoEl) {
      userInfoEl.textContent = `当前登录：${currentUser.email}`;
    }

    loadAllMyPosts();

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "index.html";
      });
    }
  } catch (err) {
    console.error("初始化“我的”页面失败：", err);
    if (userInfoEl) {
      userInfoEl.textContent = "初始化失败，请刷新页面重试。";
    }
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initMyPage();
});
