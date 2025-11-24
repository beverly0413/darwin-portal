// my.js
const supabase = window.supabaseClient || null;
const STORAGE_KEY = "darwin_life_hub_jobs_v2";

let currentUser = null;
let allJobs = [];

function loadAllJobs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.error("解析本地招聘数据失败：", e);
    return [];
  }
}

function saveAllJobs(jobs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch (e) {
    console.error("保存本地招聘数据失败：", e);
  }
}

function renderMyJobs() {
  const listEl = document.getElementById("myJobsList");
  const statusEl = document.getElementById("myJobsStatus");
  if (!listEl || !statusEl) return;

  listEl.innerHTML = "";

  if (!currentUser) {
    statusEl.textContent = "未检测到用户信息，请刷新页面重试。";
    return;
  }

  const myJobs = allJobs.filter((job) => job.userId === currentUser.id);

  if (myJobs.length === 0) {
    statusEl.textContent = "你还没有发布任何招聘信息。";
    return;
  }

  statusEl.textContent = `你共发布了 ${myJobs.length} 条招聘信息。`;

  myJobs.forEach((job) => {
    const div = document.createElement("div");
    div.className = "job-item";

    const title = job.title || "未命名职位";
    const company = job.company || "";
    const contact = job.contact || "";
    const content = job.content || "";
    const createdAt = job.createdAt ? new Date(job.createdAt) : new Date();

    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

    div.innerHTML = `
      <h3>${title}</h3>
      ${company ? `<p>公司 / 店名：${company}</p>` : ""}
      ${contact ? `<p>联系方式：${contact}</p>` : ""}
      ${content ? `<p style="white-space:pre-wrap;">${content}</p>` : ""}
      <div class="job-meta">发布于：${dateStr}</div>
    `;

    const actions = document.createElement("div");
    actions.className = "job-actions";

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.textContent = "删除这条招聘";
    delBtn.addEventListener("click", () => {
      const confirmDel = window.confirm("确认删除这条招聘信息吗？");
      if (!confirmDel) return;

      // 从 allJobs 中删掉这条
      allJobs = allJobs.filter((j) => j.id !== job.id);
      saveAllJobs(allJobs);
      renderMyJobs();
    });

    actions.appendChild(delBtn);
    div.appendChild(actions);
    listEl.appendChild(div);
  });
}

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
    if (error || !data || !data.user) {
      alert("请先登录后再访问“我的”页面。");
      window.location.href = "login.html";
      return;
    }

    currentUser = data.user;

    if (userInfoEl) {
      userInfoEl.textContent = `当前登录：${currentUser.email}`;
    }

    // 读取所有招聘信息，然后筛选当前用户的
    allJobs = loadAllJobs();
    renderMyJobs();

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await supabase.auth.signOut();
        // 这里不删除本地帖子，只是退出登录
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
