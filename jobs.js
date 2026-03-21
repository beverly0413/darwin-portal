// jobs.js —— Supabase 招聘：列表 + 详情弹窗 + 阅读量 + 点赞 + 评论 + 分享
// 帖子表：jobs_posts
// 评论表：jobs_comments

const MAX_IMAGES = 5;
let jobImagesList = [];
let allJobsCache = [];
let currentJobDetailId = null;

function ensureSupabase() {
  if (!window.supabaseClient) {
    console.error("supabaseClient 未初始化，请检查公共 supabase 配置脚本。");
    alert("系统配置错误：未找到 supabaseClient。");
    return false;
  }
  return true;
}

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

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function findJobInCache(jobId) {
  return allJobsCache.find((j) => String(j.id) === String(jobId));
}

function updateJobInCache(jobId, patch) {
  const item = findJobInCache(jobId);
  if (!item) return null;
  Object.assign(item, patch);
  return item;
}

function refreshJobCardStats(jobId) {
  const job = findJobInCache(jobId);
  if (!job) return;

  const card = document.querySelector(`.job-card[data-id="${jobId}"]`);
  if (!card) return;

  const viewsEl = card.querySelector(".job-stat-views");
  const likesEl = card.querySelector(".job-stat-likes");
  const commentsEl = card.querySelector(".job-stat-comments");

  if (viewsEl) viewsEl.textContent = job.views || 0;
  if (likesEl) likesEl.textContent = job.likes || 0;
  if (commentsEl) commentsEl.textContent = job.comments_count || 0;
}

function updateDetailStats(job) {
  const viewsEl = document.getElementById("jobDetailViews");
  const likesEl = document.getElementById("jobDetailLikes");
  const commentsEl = document.getElementById("jobDetailComments");

  if (viewsEl) viewsEl.textContent = job.views || 0;
  if (likesEl) likesEl.textContent = job.likes || 0;
  if (commentsEl) commentsEl.textContent = job.comments_count || 0;
}

async function increaseJobView(jobId) {
  if (!ensureSupabase() || !jobId) return;

  const { error } = await supabaseClient.rpc('increment_job_views', {
    post_id: jobId
  });

  if (error) {
    console.error("更新阅读量失败：", error);
    return;
  }

  // 本地也同步 +1（用于UI）
  const job = findJobInCache(jobId);
  if (job) {
    job.views = (job.views || 0) + 1;
    refreshJobCardStats(jobId);

    if (String(currentJobDetailId) === String(jobId)) {
      updateDetailStats(job);
    }
  }

  if (error) {
    console.error("更新阅读量失败：", error);
    return;
  }

  updateJobInCache(jobId, { views: nextViews });
  refreshJobCardStats(jobId);

  if (String(currentJobDetailId) === String(jobId)) {
    updateDetailStats(findJobInCache(jobId));
  }
}

async function increaseJobLike(jobId) {
  if (!ensureSupabase() || !jobId) return false;

  const job = findJobInCache(jobId);
  if (!job) return false;

  const nextLikes = (job.likes || 0) + 1;

  const { error } = await supabaseClient
    .from("jobs_posts")
    .update({ likes: nextLikes })
    .eq("id", jobId);

  if (error) {
    console.error("更新点赞量失败：", error);
    return false;
  }

  updateJobInCache(jobId, { likes: nextLikes });
  refreshJobCardStats(jobId);

  if (String(currentJobDetailId) === String(jobId)) {
    updateDetailStats(findJobInCache(jobId));
  }

  return true;
}

async function increaseJobCommentsCount(jobId) {
  if (!ensureSupabase() || !jobId) return false;

  const job = findJobInCache(jobId);
  if (!job) return false;

  const nextCount = (job.comments_count || 0) + 1;

  const { error } = await supabaseClient
    .from("jobs_posts")
    .update({ comments_count: nextCount })
    .eq("id", jobId);

  if (error) {
    console.error("更新评论数失败：", error);
    return false;
  }

  updateJobInCache(jobId, { comments_count: nextCount });
  refreshJobCardStats(jobId);

  if (String(currentJobDetailId) === String(jobId)) {
    updateDetailStats(findJobInCache(jobId));
  }

  return true;
}

/* ============= 评论相关：加载 + 提交 ============= */

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
    const cached = updateJobInCache(postId, { comments_count: 0 });
    if (cached) {
      refreshJobCardStats(postId);
      updateDetailStats(cached);
    }
    return;
  }

  listEl.innerHTML = "";
  infoEl.textContent = `共 ${data.length} 条评论`;

  data.forEach((c) => {
    const item = document.createElement("div");
    item.style.padding = "8px 0";
    item.style.borderBottom = "1px dashed #e5e7eb";

    const meta = document.createElement("div");
    meta.style.fontSize = "12px";
    meta.style.color = "#6b7280";
    meta.textContent = `${c.user_email || "匿名"} · ${formatDate(c.created_at)}`;

    const body = document.createElement("div");
    body.style.fontSize = "14px";
    body.style.color = "#111827";
    body.style.whiteSpace = "pre-wrap";
    body.style.lineHeight = "1.7";
    body.textContent = c.content;

    item.appendChild(meta);
    item.appendChild(body);
    listEl.appendChild(item);
  });

  const cached = updateJobInCache(postId, { comments_count: data.length });
  if (cached) {
    refreshJobCardStats(postId);
    updateDetailStats(cached);
  }
}

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
    statusEl.style.color = "red";
    return;
  }

  await increaseJobCommentsCount(postId);

  textarea.value = "";
  statusEl.textContent = "评论已发表。";
  statusEl.style.color = "green";

  await loadJobComments(postId, listEl, infoEl);
}

/* ============= 详情弹窗 ============= */

function showJobDetail(job) {
  const old = document.getElementById("jobDetailOverlay");
  if (old) old.remove();

  currentJobDetailId = job.id;

  const overlay = document.createElement("div");
  overlay.id = "jobDetailOverlay";
  overlay.className = "job-detail-overlay";

  const card = document.createElement("div");
  card.className = "job-detail-card";

  const closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.className = "job-detail-close";
  closeBtn.onclick = () => {
    currentJobDetailId = null;
    overlay.remove();
  };

  const titleEl = document.createElement("h2");
  titleEl.textContent = job.title || "未命名职位";
  titleEl.style.margin = "0 0 8px 0";
  titleEl.style.fontSize = "22px";
  titleEl.style.color = "#0f172a";

  const metaEl = document.createElement("div");
  metaEl.style.fontSize = "13px";
  metaEl.style.color = "#6b7280";
  metaEl.style.marginBottom = "6px";
  const dateStr = formatDate(job.created_at);
  metaEl.textContent = dateStr ? `发布于：${dateStr}` : "";

  const statsBar = document.createElement("div");
  statsBar.className = "job-detail-stats";
  statsBar.innerHTML = `
    <span class="job-detail-stat">👁 阅读 <strong id="jobDetailViews">${job.views || 0}</strong></span>
    <button id="jobDetailLikeBtn" class="job-detail-stat job-like-btn" type="button">👍 点赞 <strong id="jobDetailLikes">${job.likes || 0}</strong></button>
    <span class="job-detail-stat">💬 评论 <strong id="jobDetailComments">${job.comments_count || 0}</strong></span>
  `;

  const infoEl = document.createElement("div");
  infoEl.style.fontSize = "14px";
  infoEl.style.color = "#111827";
  infoEl.style.lineHeight = "1.8";

  let infoHtml = "";
  if (job.company) {
    infoHtml += `<p><strong>公司：</strong>${escapeHtml(job.company)}</p>`;
  }
  if (job.contact) {
    infoHtml += `<p><strong>联系方式：</strong>${escapeHtml(job.contact)}</p>`;
  }
  if (job.content) {
    infoHtml += `<p style="margin-top:10px;white-space:pre-wrap;">${escapeHtml(job.content)}</p>`;
  }
  infoEl.innerHTML = infoHtml || "<p>暂无详细描述。</p>";

  const imagesWrapper = document.createElement("div");
  if (Array.isArray(job.images) && job.images.length > 0) {
    imagesWrapper.style.marginTop = "14px";
    imagesWrapper.style.display = "grid";
    imagesWrapper.style.gridTemplateColumns = "repeat(auto-fill,minmax(160px,1fr))";
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

  const commentBlock = document.createElement("div");
  commentBlock.className = "job-comments-block";

  const commentTitle = document.createElement("h3");
  commentTitle.textContent = "评论";
  commentTitle.style.fontSize = "16px";
  commentTitle.style.margin = "0 0 6px 0";

  const commentInfo = document.createElement("div");
  commentInfo.style.fontSize = "12px";
  commentInfo.style.color = "#6b7280";
  commentInfo.style.marginBottom = "6px";

  const commentList = document.createElement("div");
  commentList.className = "job-comments-list";

  const commentForm = document.createElement("div");
  commentForm.style.marginTop = "10px";

  const textarea = document.createElement("textarea");
  textarea.rows = 3;
  textarea.placeholder = "写下你的评论，例如：有兴趣，怎么申请？";
  textarea.style.width = "100%";
  textarea.style.boxSizing = "border-box";
  textarea.style.resize = "vertical";
  textarea.style.borderRadius = "8px";
  textarea.style.border = "1px solid #d1d5db";
  textarea.style.padding = "8px 10px";
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
  card.appendChild(statsBar);
  card.appendChild(infoEl);
  if (imagesWrapper.childElementCount > 0) card.appendChild(imagesWrapper);
  card.appendChild(commentBlock);

  overlay.appendChild(card);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      currentJobDetailId = null;
      overlay.remove();
    }
  });

  document.body.appendChild(overlay);

  const likeBtn = document.getElementById("jobDetailLikeBtn");
  if (likeBtn) {
    likeBtn.addEventListener("click", async () => {
      likeBtn.disabled = true;
      await increaseJobLike(job.id);
      likeBtn.disabled = false;
    });
  }

  loadJobComments(job.id, commentList, commentInfo);
  increaseJobView(job.id);
}

/* ============= 列表 + 深度链接 ============= */

function handleJobDeepLink(jobs) {
  try {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("job");
    if (!id) return;

    const job = jobs.find((j) => String(j.id) === String(id));
    if (!job) return;

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
    .select("id, title, company, contact, content, images, created_at, views, likes, comments_count")
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

  allJobsCache = data.map((job) => ({
    ...job,
    views: job.views || 0,
    likes: job.likes || 0,
    comments_count: job.comments_count || 0,
  }));

  listEl.innerHTML = "";

  allJobsCache.forEach((job) => {
    const div = document.createElement("div");
    div.className = "job-card";
    div.dataset.id = job.id;

    const createdAt = job.created_at ? new Date(job.created_at) : new Date();
    const dateStr = `${createdAt.getFullYear()}-${String(createdAt.getMonth() + 1).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

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

    div.innerHTML = `
      <h3 class="job-card-title">${escapeHtml(job.title || "未命名职位")}</h3>
      ${job.company ? `<p style="margin:0;font-size:14px;"><strong>公司：</strong>${escapeHtml(job.company)}</p>` : ""}
      ${job.contact ? `<p style="margin:2px 0 0 0;font-size:14px;"><strong>联系方式：</strong>${escapeHtml(job.contact)}</p>` : ""}
      ${
        summary
          ? `<p style="margin-top:4px;font-size:14px;color:#6b7280;white-space:pre-wrap;">${escapeHtml(summary)}</p>`
          : ""
      }
      ${imagesHtml}
      <div class="job-meta-row">
        <div class="job-meta-left">
          <small style="font-size:12px;color:#6b7280;">发布于：${dateStr}</small>
          <div class="job-stats">
            <span class="job-stat">👁 <span class="job-stat-views">${job.views || 0}</span></span>
            <span class="job-stat">👍 <span class="job-stat-likes">${job.likes || 0}</span></span>
            <span class="job-stat">💬 <span class="job-stat-comments">${job.comments_count || 0}</span></span>
          </div>
        </div>
        <button
          class="job-share-btn"
          type="button"
          data-id="${job.id}"
          data-title="${escapeHtml(job.title || "")}"
        >
          分享
        </button>
      </div>
    `;

    div.addEventListener("click", () => showJobDetail(job));
    listEl.appendChild(div);
  });

  handleJobDeepLink(allJobsCache);
}

/* ============= 发帖表单 ============= */

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

    const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
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
      views: 0,
      likes: 0,
      comments_count: 0,
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

/* ============= 分享功能 ============= */

async function shareJob(jobId, jobTitle) {
  const url =
    window.location.origin +
    window.location.pathname +
    "?job=" +
    encodeURIComponent(jobId);

  const safeTitle = jobTitle && jobTitle.trim()
    ? jobTitle.trim()
    : "达尔文招聘信息";

  const shareText = `【招聘】${safeTitle}\n达尔文BBS 职位详情：`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: safeTitle,
        text: shareText,
        url: url,
      });
      return;
    } catch (err) {
      console.error("系统分享失败：", err);
    }
  }

  const copyText = `【招聘】${safeTitle}\n查看详情：${url}`;

  try {
    await navigator.clipboard.writeText(copyText);
    alert("已复制：标题 + 链接，可以直接粘贴给好友。");
  } catch (err) {
    console.error("复制链接失败：", err);
    alert("请手动复制此内容分享：\n\n" + copyText);
  }
}

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".job-share-btn");
  if (!btn) return;

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