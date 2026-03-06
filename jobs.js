// jobs.js —— Supabase 招聘：列表 + 详情弹窗（图片查看/保存）+ 评论 + 分享
// 帖子表：jobs_posts
// 评论表：jobs_comments

const MAX_IMAGES = 5;
let jobImagesList = [];

// 检查 supabaseClient 是否存在
function ensureSupabase() {
  if (!window.supabaseClient) {
    console.error("supabaseClient 未初始化，请检查公共 supabase 配置脚本。");
    alert("系统配置错误：未找到 supabaseClient。");
    return false;
  }
  return true;
}

// 小工具：格式化时间
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
function jobFilesToBase64(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
}

/* ============= 评论相关：加载 + 提交 ============= */

// 加载某条 job 的评论
async function loadJobComments(postId, listEl, infoEl) {
  if (!ensureSupabase()) return;

  listEl.innerHTML = "评论加载中...";

  const { data, error } = await supabaseClient
    .from("jobs_comments")
    .select("id, content, user_email, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("加载招聘评论失败：", error);
    listEl.textContent = "评论加载失败。";
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<p style="font-size:13px;color:#9ca3af;">还没有评论，欢迎第一个留言。</p>';
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
async function submitJobComment(postId, textarea, statusEl, listEl, infoEl) {
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
  const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
  if (userErr || !userData?.user) {
    alert("请先登录后再发表评论。");
    window.location.href = "login.html";
    return;
  }
  const user = userData.user;

  const { error } = await supabaseClient.from("jobs_comments").insert({
    post_id: postId,
    content,
    user_id: user.id,
    user_email: user.email,
  });

  if (error) {
    console.error("发表评论失败：", error);
    statusEl.textContent = "发表评论失败，请稍后再试。";
    statusEl.style.color = "红色";
    return;
  }

  textarea.value = "";
  statusEl.textContent = "评论已发表。";
  statusEl.style.color = "green";

  await loadJobComments(postId, listEl, infoEl);
}

/* ============= 详情弹窗（含图片查看/保存 + 评论区） ============= */

function showJobDetail(job) {
  const old = document.getElementById("jobDetailOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "jobDetailOverlay";
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
  titleEl.textContent = job.title || "未命名职位";
  titleEl.style.margin = "0 0 8px 0";
  titleEl.style.fontSize = "18px";

  const metaEl = document.createElement("div");
  metaEl.style.fontSize = "13px";
  metaEl.style.color = "#6b7280";
  metaEl.style.marginBottom = "6px";
  const dateStr = formatDate(job.created_at);
  metaEl.textContent = dateStr ? `发布于：${dateStr}` : "";

  const infoEl = document.createElement("div");
  infoEl.style.fontSize = "14px";
  infoEl.style.color = "#111827";
  infoEl.style.lineHeight = "1.6";

  let infoHtml = "";
  if (job.company) {
    infoHtml += `<p><strong>公司：</strong>${job.company}</p>`;
  }
  if (job.contact) {
    infoHtml += `<p><strong>联系方式：</strong>${job.contact}</p>`;
  }
  if (job.content) {
    infoHtml += `<p style="margin-top:8px;white-space:pre-wrap;">${job.content}</p>`;
  }
  infoEl.innerHTML = infoHtml || "<p>暂无详细描述。</p>";

  // 图片区域：查看大图 + 保存
  const imagesWrapper = document.createElement("div");
  if (Array.isArray(job.images) && job.images.length > 0) {
    imagesWrapper.style.marginTop = "14px";
    imagesWrapper.style.display = "grid";
    imagesWrapper.style.gridTemplateColumns =
      "repeat(auto-fill,minmax(160px,1fr))";
    imagesWrapper.style.gap = "10px";

    job.images.forEach((src, idx) => {
      const box = document.createElement("div");
      box.style.borderRadius = "12px";
      box.style.border = "1px solid #e5e7eb";
      box.style.padding = "6px";
      box.style.background = "#f9fafb";
      box.style.display = "flex";
      box.style.flexDirection = "column";
      box.style.gap = "6px";

      const img = document.createElement("img");
      img.src = src;
      img.alt = "职位图片";
      img.style.width = "100%";
      img.style.borderRadius = "8px";
      img.style.objectFit = "cover";
      img.loading = "lazy";

      const btnRow = document.createElement("div");
      btnRow.style.display = "flex";
      btnRow.style.justifyContent = "space-between";
      btnRow.style.gap = "4px";

      const viewLink = document.createElement("a");
      viewLink.textContent = "查看大图";
      viewLink.href = src;
      viewLink.target = "_blank";
      viewLink.style.fontSize = "12px";
      viewLink.style.color = "#2563eb";
      viewLink.style.textDecoration = "none";

      const saveLink = document.createElement("a");
      saveLink.textContent = "保存图片";
      saveLink.href = src;
      saveLink.download = `job-image-${job.id || "p"}-${idx + 1}.png`;
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

  const commentForm = document.createElement("div");
  commentForm.style.marginTop = "8px";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.placeholder = "写下你的评论，例如：有兴趣，怎么申请？";
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
    await submitJobComment(job.id, textarea, statusSpan, commentList, commentInfo);
  });

  actionRow.appendChild(statusSpan);
  actionRow.appendChild(submitBtn);

  commentForm.appendChild(textarea);
  commentForm.appendChild(actionRow);

  commentBlock.appendChild(commentTitle);
  commentBlock.appendChild(commentInfo);
  commentBlock.appendChild(commentList);
  commentBlock.appendChild(commentForm);

  card.appendChild(closeBtn);
  card.appendChild(titleEl);
  card.appendChild(metaEl);
  card.appendChild(infoEl);
  if (imagesWrapper.childElementCount > 0) card.appendChild(imagesWrapper);
  card.appendChild(commentBlock);

  overlay.appendChild(card);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);

  loadJobComments(job.id, commentList, commentInfo);
}

/* ============= 列表：加载所有招聘信息 + 分享按钮 + 深度链接 ============= */

// URL 中如果有 ?job=xxx，则自动打开对应详情
function handleJobDeepLink(jobs) {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("job");
    if (!id) return;

    const job = jobs.find((j) => String(j.id) === String(id));
    if (!job) return;

    // 小延迟，确保列表渲染完成
    setTimeout(() => showJobDetail(job), 0);
  } catch (e) {
    console.error("解析 job 参数失败：", e);
  }
}

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

    // 绿色方框卡片样式
    div.className = "job-card";
    div.style.border = "1px solid #d1e5d4";
    div.style.borderRadius = "12px";
    div.style.background = "#ffffff";
    div.style.padding = "12px 16px";
    div.style.marginBottom = "10px";
    div.style.boxShadow = "0 1px 2px rgba(15,23,42,0.05)";
    div.style.cursor = "pointer";

    const createdAt = job.created_at ? new Date(job.created_at) : new Date();
    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

    let imagesHtml = "";
    if (Array.isArray(job.images) && job.images.length > 0) {
      imagesHtml = `
        <div class="job-photos" style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;">
          ${job.images
            .slice(0, 3)
            .map(
              (img) =>
                `<img src="${img}" style="width:90px;height:90px;object-fit:cover;border-radius:8px;border:1px solid #d1e5d4;" />`
            )
            .join("")}
          ${
            job.images.length > 3
              ? `<span style="font-size:12px;color:#6b7280;margin-left:6px;align-self:center;">+${job.images.length - 3} 张</span>`
              : ""
          }
        </div>`;
    }

    let summary = job.content || "";
    if (summary.length > 80) summary = summary.slice(0, 80) + "…";

    // 内部 HTML + 分享按钮
    div.innerHTML = `
      <h3 style="margin:0 0 4px 0;font-size:16px;">${job.title}</h3>
      ${job.company ? `<p style="margin:0;font-size:14px;"><strong>公司：</strong>${job.company}</p>` : ""}
      ${job.contact ? `<p style="margin:2px 0 0 0;font-size:14px;"><strong>联系方式：</strong>${job.contact}</p>` : ""}
      ${
        summary
          ? `<p style="margin-top:4px;font-size:14px;color:#6b7280;white-space:pre-wrap;">${summary}</p>`
          : ""
      }
      ${imagesHtml}
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;">
        <small style="font-size:12px;color:#6b7280;">发布于：${dateStr}</small>
        <button
          class="job-share-btn"
          type="button"
          data-id="${job.id}"
          data-title="${job.title || ""}"
          style="padding:4px 10px;border-radius:999px;border:1px solid #16a34a;background:#ffffff;color:#16a34a;font-size:12px;cursor:pointer;"
        >
          分享
        </button>
      </div>
    `;

    // 点击整卡片打开详情（分享按钮会在事件里 stopPropagation）
    div.addEventListener("click", () => showJobDetail(job));

    listEl.appendChild(div);
  });

  // 如果 URL 中有 ?job=xxx，则自动打开对应详情
  handleJobDeepLink(data);
}

/* ============= 发帖表单：发布招聘 ============= */

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

function setupJobForm() {
  const form = document.getElementById("jobForm");
  const statusEl = document.getElementById("jobStatus");
  const inputImg = document.getElementById("jobImages");
  const btnClear = document.getElementById("jobClearImages");

  if (!form || !statusEl) return;

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

  if (btnClear) {
    btnClear.addEventListener("click", () => {
      jobImagesList = [];
      updateJobPreview();
    });
  }

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

    const { data: userData, error: userErr } =
      await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      alert("请先登录后再发布招聘信息。");
      window.location.href = "login.html";
      return;
    }
    const user = userData.user;

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

/* ============= 分享功能（系统分享 + 复制链接） ============= */

// 升级版分享：带“帖子主题提醒”
async function shareJob(jobId, jobTitle) {
  const url =
    window.location.origin +
    window.location.pathname +
    "?job=" +
    encodeURIComponent(jobId);

  const safeTitle = jobTitle && jobTitle.trim()
    ? jobTitle.trim()
    : "达尔文招聘信息";

  // 在分享内容里主动带上标题提示
  const shareText = `【招聘】${safeTitle}\n达尔文BBS 职位详情：`;

  // 1）优先使用系统分享（手机）
  if (navigator.share) {
    try {
      await navigator.share({
        title: safeTitle,
        text: shareText, // 这里就包含“帖子主题提醒”
        url: url,
      });
      return;
    } catch (err) {
      console.error("系统分享失败：", err);
      // 失败后继续走复制逻辑
    }
  }

  // 2）不支持系统分享时，复制一段文案 + 链接
  const copyText = `【招聘】${safeTitle}\n查看详情：${url}`;

  try {
    await navigator.clipboard.writeText(copyText);
    alert("已复制：标题 + 链接，可以直接粘贴给好友。");
  } catch (err) {
    console.error("复制链接失败：", err);
    alert("请手动复制此内容分享：\n\n" + copyText);
  }
}


// 事件代理：监听分享按钮（并阻止触发卡片点击）
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".job-share-btn");
  if (!btn) return;

  // 避免点击分享按钮时同时触发卡片的点击事件
  e.stopPropagation();

  const jobId = btn.dataset.id;
  const jobTitle = btn.dataset.title || "招聘信息";

  if (jobId) {
    shareJob(jobId, jobTitle);
  }
});

/* ============= 初始化 ============= */

document.addEventListener("DOMContentLoaded", () => {
  loadJobs();
  setupJobForm();
});
