// jobs.js —— 使用 Supabase 存储招聘信息
// 表名：jobs_posts

const MAX_IMAGES = 5;
let jobImagesList = [];

// 工具：检查 supabaseClient 是否存在
function ensureSupabase() {
  if (!window.supabaseClient) {
    console.error("supabaseClient 未初始化，请检查公共配置脚本。");
    alert("系统配置错误：未找到 supabaseClient。");
    return false;
  }
  return true;
}

// File[] -> base64[]
function jobFilesToBase64(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(file);
        })
    )
  );
}

// 图片预览
function updateJobPreview() {
  const previewEl = document.getElementById("jobPreview");
  if (!previewEl) return;

  previewEl.innerHTML = "";

  jobImagesList.forEach((file, index) => {
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

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.type = "button";
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

// 加载招聘列表（所有人可见）
async function loadJobs() {
  const listEl = document.getElementById("jobList");
  if (!listEl) return;

  listEl.innerHTML = "加载中...";

  if (!ensureSupabase()) {
    listEl.textContent = "系统配置错误，无法加载数据。";
    return;
  }

  const { data, error } = await supabaseClient
    .from("jobs_posts")
    .select("id, title, company, contact, content, images, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("加载招聘信息失败：", error);
    listEl.textContent = "加载失败，请稍后再试。";
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<p style="color:#6b7280;font-size:13px;">目前还没有招聘信息，欢迎发布第一条。</p>';
    return;
  }

  listEl.innerHTML = "";

  data.forEach((job) => {
    const div = document.createElement("div");
    div.className = "post";

    const createdAt = job.created_at ? new Date(job.created_at) : new Date();
    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

    let imagesHtml = "";
    if (Array.isArray(job.images) && job.images.length > 0) {
      imagesHtml = `
        <div class="job-photos">
          ${job.images.map((img) => `<img src="${img}" />`).join("")}
        </div>`;
    }

    div.innerHTML = `
      <h3>${job.title}</h3>
      ${job.company ? `<p><strong>公司：</strong>${job.company}</p>` : ""}
      ${job.contact ? `<p><strong>联系方式：</strong>${job.contact}</p>` : ""}
      ${
        job.content
          ? `<p style="white-space:pre-wrap;">${job.content}</p>`
          : ""
      }
      ${imagesHtml}
      <small>发布于：${dateStr}</small>
    `;

    listEl.appendChild(div);
  });
}

// 表单逻辑
function setupJobForm() {
  const form = document.getElementById("jobForm");
  const statusEl = document.getElementById("jobStatus");
  const inputImg = document.getElementById("jobImages");
  const btnClear = document.getElementById("jobClearImages");

  if (!form || !statusEl) return;

  // 选择图片
  if (inputImg) {
    inputImg.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        if (jobImagesList.length < MAX_IMAGES) {
          jobImagesList.push(f);
        }
      }
      inputImg.value = "";
      updateJobPreview();
    });
  }

  // 清空图片
  if (btnClear) {
    btnClear.addEventListener("click", () => {
      jobImagesList = [];
      updateJobPreview();
    });
  }

  // 提交
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureSupabase()) return;

    const title = document.getElementById("jobTitle").value.trim();
    const company = document.getElementById("jobCompany").value.trim();
    const contact = document.getElementById("jobContact").value.trim();
    const content = document.getElementById("jobContent").value.trim();

    if (!title) {
      statusEl.textContent = "职位名称是必填项。";
      statusEl.style.color = "red";
      return;
    }
    if (!contact) {
      statusEl.textContent = "联系方式是必填项。";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "正在保存...";
    statusEl.style.color = "#6b7280";

    // 检查登录
    const { data: userData, error: userErr } =
      await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      alert("请先登录后再发布招聘信息。");
      window.location.href = "login.html";
      return;
    }
    const user = userData.user;

    // 转图片
    let images = [];
    try {
      images = await jobFilesToBase64(jobImagesList.slice(0, MAX_IMAGES));
    } catch (err) {
      console.error("读取图片失败：", err);
      statusEl.textContent = "读取图片失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    const payload = {
      title,
      company,
      contact,
      content,
      images,
      user_id: user.id,
      user_email: user.email,
    };

    const { error } = await supabaseClient.from("jobs_posts").insert(payload);

    if (error) {
      console.error("发布招聘失败：", error);
      statusEl.textContent = "发布失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "发布成功！";
    statusEl.style.color = "green";

    form.reset();
    jobImagesList = [];
    updateJobPreview();
    loadJobs();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadJobs();
  setupJobForm();
});
