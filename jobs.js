// jobs.js
// 所有人都能看列表；只有发布时才检查是否登录

const STORAGE_KEY = "darwin_life_hub_jobs_v2";

const MAX_IMAGES = 5;
let jobImagesList = [];
let jobsMemory = [];

// 读取本地帖子（不含图片）
function loadJobsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// 保存文字部分
function saveJobsToStorageTextOnly() {
  const textOnly = jobsMemory.map((job) => ({
    id: job.id,
    title: job.title,
    company: job.company,
    contact: job.contact,
    content: job.content,
    createdAt: job.createdAt,
    userId: job.userId || null,
    userEmail: job.userEmail || null,
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnly));
}

// 预览图片
function updateJobPreview() {
  const previewEl = document.getElementById("jobPreview");
  previewEl.innerHTML = "";

  jobImagesList.forEach((file, index) => {
    const wrap = document.createElement("div");
    wrap.className = "preview-item";

    const img = document.createElement("img");
    const reader = new FileReader();

    reader.onload = (e) => (img.src = e.target.result);
    reader.readAsDataURL(file);

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.className = "preview-remove";
    btn.addEventListener("click", () => {
      jobImagesList.splice(index, 1);
      updateJobPreview();
    });

    wrap.appendChild(img);
    wrap.appendChild(btn);
    previewEl.appendChild(wrap);
  });
}

// DataURL 转换
function readFilesAsDataUrls(files) {
  return Promise.all(
    Array.from(files).map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(file);
        })
    )
  );
}

// 渲染招聘列表
function renderJobs() {
  const listEl = document.getElementById("jobList");
  listEl.innerHTML = "";

  if (jobsMemory.length === 0) {
    listEl.innerHTML =
      '<p style="color:#6b7280;font-size:13px;">目前还没有招聘信息，欢迎发布第一条。</p>';
    return;
  }

  jobsMemory.forEach((job) => {
    const div = document.createElement("div");
    div.className = "job";

    const date = new Date(job.createdAt);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;

    let imagesHtml = "";
    if (job.images) {
      imagesHtml = `
        <div class="job-photos">
          ${job.images.map((img) => `<img src="${img}" />`).join("")}
        </div>`;
    }

    div.innerHTML = `
      <h3>${job.title}</h3>
      ${job.company ? `<p><strong>公司：</strong>${job.company}</p>` : ""}
      ${job.contact ? `<p><strong>联系方式：</strong>${job.contact}</p>` : ""}
      ${job.content ? `<p style="white-space:pre-wrap;">${job.content}</p>` : ""}
      ${imagesHtml}
      <small>发布于：${dateStr}</small>
    `;

    listEl.appendChild(div);
  });
}

// 表单逻辑
function setupForm() {
  const form = document.getElementById("jobForm");
  const statusEl = document.getElementById("jobStatus");
  const inputImg = document.getElementById("jobImages");
  const btnClear = document.getElementById("jobClearImages");

  inputImg.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    for (const f of files) {
      if (jobImagesList.length < MAX_IMAGES) jobImagesList.push(f);
    }
    inputImg.value = "";
    updateJobPreview();
  });

  btnClear.addEventListener("click", () => {
    jobImagesList = [];
    updateJobPreview();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = document.getElementById("jobTitle").value.trim();
    const company = document.getElementById("jobCompany").value.trim();
    const contact = document.getElementById("jobContact").value.trim();
    const content = document.getElementById("jobContent").value.trim();

    if (!title || !contact) {
      statusEl.textContent = "职位名称和联系方式是必填项";
      statusEl.style.color = "red";
      return;
    }

    // ✨ 发帖前检查登录状态
    const { data, error } = await supabaseClient.auth.getUser();
    if (error || !data?.user) {
      alert("请先登录后再发布招聘信息。");
      window.location.href = "login.html";
      return;
    }

    const user = data.user;

    statusEl.textContent = "正在保存...";
    statusEl.style.color = "#6b7280";

    const images = await readFilesAsDataUrls(jobImagesList);

    const newJob = {
      id: Date.now(),
      title,
      company,
      contact,
      content,
      images,
      createdAt: new Date().toISOString(),
      userId: user.id,
      userEmail: user.email,
    };

    jobsMemory.unshift(newJob);
    saveJobsToStorageTextOnly();
    renderJobs();

    form.reset();
    jobImagesList = [];
    updateJobPreview();

    statusEl.textContent = "发布成功";
    statusEl.style.color = "green";
  });
}

// 初始化：不要求登录
document.addEventListener("DOMContentLoaded", () => {
  jobsMemory = loadJobsFromStorage();
  renderJobs();
  setupForm();
});
