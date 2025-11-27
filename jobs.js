// jobs.js —— 带绿色方框列表 + 详情弹窗 + 评论 + Supabase 数据库
// 帖子表：jobs_posts
// 评论表：jobs_comments

const MAX_IMAGES = 5;
let jobImagesList = [];

// 校验 supabase
function ensureSupabase() {
  if (!window.supabaseClient) {
    alert("系统错误：缺少 supabaseClient");
    return false;
  }
  return true;
}

// 格式化时间
function formatDate(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

// File → base64
function filesToBase64(files) {
  return Promise.all(
    files.map(
      (f) =>
        new Promise((resolve) => {
          const r = new FileReader();
          r.onload = (e) => resolve(e.target.result);
          r.readAsDataURL(f);
        })
    )
  );
}

/* ===================== 评论功能 ===================== */

async function loadJobComments(postId, listEl, infoEl) {
  const { data, error } = await window.supabaseClient
    .from("jobs_comments")
    .select("*")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    listEl.innerHTML = "评论加载失败";
    return;
  }

  if (!data.length) {
    infoEl.textContent = "";
    listEl.innerHTML =
      '<p style="color:#999;font-size:13px;">暂无评论，欢迎留言。</p>';
    return;
  }

  infoEl.textContent = `共 ${data.length} 条评论`;
  listEl.innerHTML = "";

  data.forEach((c) => {
    const item = document.createElement("div");
    item.style.padding = "6px 0";
    item.style.borderBottom = "1px dashed #e5e7eb";

    item.innerHTML = `
      <div style="font-size:12px;color:#6b7280;">
        ${c.user_email || "匿名"} · ${formatDate(c.created_at)}
      </div>
      <div style="font-size:14px;white-space:pre-wrap;margin-top:2px;">
        ${c.content}
      </div>
    `;
    listEl.appendChild(item);
  });
}

async function submitJobComment(postId, textarea, statusEl, listEl, infoEl) {
  const content = textarea.value.trim();
  if (!content) {
    statusEl.textContent = "评论不能为空";
    statusEl.style.color = "red";
    return;
  }

  const { data: userData } = await supabaseClient.auth.getUser();
  if (!userData?.user) {
    alert("请先登录");
    return;
  }

  const { error } = await supabaseClient.from("jobs_comments").insert({
    post_id: postId,
    content,
    user_id: userData.user.id,
    user_email: userData.user.email,
  });

  if (error) {
    statusEl.textContent = "评论失败";
    statusEl.style.color = "red";
    return;
  }

  statusEl.textContent = "评论成功";
  statusEl.style.color = "green";
  textarea.value = "";

  loadJobComments(postId, listEl, infoEl);
}

/* ===================== 详情弹窗 ===================== */

function showJobDetail(job) {
  const old = document.getElementById("jobDetailOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "jobDetailOverlay";
  overlay.style.cssText = `
    position:fixed;inset:0;background:rgba(15,23,42,0.55);
    display:flex;align-items:center;justify-content:center;z-index:9999;
  `;

  const card = document.createElement("div");
  card.style.cssText = `
    width:92%;max-width:800px;max-height:90vh;overflow-y:auto;
    background:white;border-radius:16px;padding:24px;
  `;

  /* 标题 */
  card.innerHTML = `
    <h2 style="margin:0 0 6px;font-size:20px;">${job.title}</h2>
    <div style="font-size:13px;color:#6b7280;margin-bottom:14px;">
      发布于：${formatDate(job.created_at)}
    </div>

    ${job.company ? `<p><strong>公司：</strong>${job.company}</p>` : ""}
    ${job.contact ? `<p><strong>联系方式：</strong>${job.contact}</p>` : ""}
    ${
      job.content
        ? `<p style="white-space:pre-wrap;margin-top:8px;">${job.content}</p>`
        : ""
    }
  `;

  /* 图片展示 */
  if (Array.isArray(job.images) && job.images.length) {
    const imgWrap = document.createElement("div");
    imgWrap.style.cssText =
      "display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:14px;";

    job.images.forEach((src, idx) => {
      const box = document.createElement("div");
      box.style.cssText =
        "border:1px solid #e5e7eb;border-radius:10px;padding:6px;background:#fafafa;";

      box.innerHTML = `
        <img src="${src}" style="width:100%;border-radius:8px;" />
        <div style="display:flex;justify-content:space-between;margin-top:6px;">
          <a href="${src}" target="_blank" style="font-size:12px;color:#2563eb;">查看大图</a>
          <a href="${src}" download="job-${job.id}-${idx}.png" style="font-size:12px;color:#16a34a;">保存图片</a>
        </div>
      `;
      imgWrap.appendChild(box);
    });

    card.appendChild(imgWrap);
  }

  /* 评论区 */
  const commentBlock = document.createElement("div");
  commentBlock.style.marginTop = "20px";
  commentBlock.innerHTML = `
    <h3 style="font-size:16px;margin:0 0 6px;">评论</h3>
    <div id="commentInfo" style="font-size:12px;color:#6b7280;margin-bottom:6px;"></div>
    <div id="commentList" style="margin-bottom:10px;"></div>

    <textarea id="commentText" rows="3" placeholder="写下你的评论..."
      style="width:100%;border:1px solid #d1d5db;border-radius:8px;padding:6px 8px;"></textarea>

    <div style="margin-top:6px;display:flex;justify-content:space-between;align-items:center;">
      <span id="commentStatus" style="font-size:12px;color:#6b7280;"></span>
      <button id="commentBtn" style="
        background:#16a34a;color:white;border:none;border-radius:20px;
        padding:6px 16px;cursor:pointer;
      ">发表评论</button>
    </div>
  `;

  card.appendChild(commentBlock);
  overlay.appendChild(card);

  overlay.onclick = (e) => {
    if (e.target === overlay) overlay.remove();
  };

  document.body.appendChild(overlay);

  // 加载评论
  loadJobComments(
    job.id,
    commentBlock.querySelector("#commentList"),
    commentBlock.querySelector("#commentInfo")
  );

  // 提交评论
  commentBlock.querySelector("#commentBtn").onclick = () =>
    submitJobComment(
      job.id,
      commentBlock.querySelector("#commentText"),
      commentBlock.querySelector("#commentStatus"),
      commentBlock.querySelector("#commentList"),
      commentBlock.querySelector("#commentInfo")
    );
}

/* ===================== 加载列表（绿色方框） ===================== */

async function loadJobs() {
  const listEl = document.getElementById("jobList");
  if (!listEl) return;

  listEl.innerHTML = "加载中…";

  const { data, error } = await supabaseClient
    .from("jobs_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    listEl.innerHTML = "加载失败";
    return;
  }

  if (!data.length) {
    listEl.innerHTML = "<p>暂无招聘信息</p>";
    return;
  }

  listEl.innerHTML = "";

  data.forEach((job) => {
    const div = document.createElement("div");

    /* ☆☆☆ 绿色边框方框样式（关键） ☆☆☆ */
    div.style.cssText = `
      border:1px solid #d1e5d4;
      background:white;
      border-radius:12px;
      padding:12px 16px;
      margin-bottom:16px;
      box-shadow:0 1px 2px rgba(15,23,42,0.05);
      cursor:pointer;
    `;

    let summary = job.content || "";
    if (summary.length > 80) summary = summary.slice(0, 80) + "…";

    div.innerHTML = `
      <h3>${job.title}</h3>
      <p><strong>联系方式：</strong>${job.contact || "未提供"}</p>
      <p style="white-space:pre-wrap;">${summary}</p>
      <small style="color:#6b7280;">发布于：${formatDate(job.created_at)}</small>
    `;

    div.onclick = () => showJobDetail(job);

    listEl.appendChild(div);
  });
}

/* ===================== 发帖 ===================== */

function updateJobPreview() {
  const preview = document.getElementById("jobPreview");
  if (!preview) return;
  preview.innerHTML = "";

  jobImagesList.forEach((file, idx) => {
    const wrap = document.createElement("div");
    wrap.style.cssText = "display:inline-block;margin-right:6px;position:relative;";

    const img = document.createElement("img");
    img.style.cssText =
      "width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid #d1e5d4;";
    const r = new FileReader();
    r.onload = (e) => (img.src = e.target.result);
    r.readAsDataURL(file);

    wrap.appendChild(img);
    preview.appendChild(wrap);
  });
}

function setupJobForm() {
  const form = document.getElementById("jobForm");
  if (!form) return;

  const statusEl = document.getElementById("jobStatus");
  const inputImg = document.getElementById("jobImages");

  if (inputImg) {
    inputImg.onchange = (e) => {
      const f = Array.from(e.target.files || []);
      f.forEach((x) => {
        if (jobImagesList.length < MAX_IMAGES) jobImagesList.push(x);
      });
      inputImg.value = "";
      updateJobPreview();
    };
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!ensureSupabase()) return;

    const title = document.getElementById("jobTitle").value.trim();
    const contact = document.getElementById("jobContact").value.trim();
    const content = document.getElementById("jobContent").value.trim();

    if (!title || !contact) {
      statusEl.textContent = "标题和联系方式不能为空";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "正在发布…";
    statusEl.style.color = "#666";

    const { data: userData } = await supabaseClient.auth.getUser();
    if (!userData?.user) {
      alert("请先登录");
      return;
    }

    let images = [];
    if (jobImagesList.length) {
      images = await filesToBase64(jobImagesList);
    }

    const { error } = await supabaseClient.from("jobs_posts").insert({
      title,
      contact,
      content,
      images,
      user_id: userData.user.id,
      user_email: userData.user.email,
    });

    if (error) {
      statusEl.textContent = "发布失败";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "发布成功！";
    statusEl.style.color = "green";
    form.reset();
    jobImagesList = [];
    document.getElementById("jobPreview").innerHTML = "";

    loadJobs();
  };
}

/* ===================== 启动 ===================== */

document.addEventListener("DOMContentLoaded", () => {
  loadJobs();
  setupJobForm();
});
