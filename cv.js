// cv.js —— 使用 Supabase 存储求职信息
// 表名：cv_posts

const CV_MAX_IMAGES = 5;
let cvImagesList = [];

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
function cvFilesToBase64(files) {
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

// 时间格式化（用于详情和评论）
function cvFormatDate(iso) {
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

/* ============ 评论相关：cv_comments ============ */

// 约定 Supabase 表：cv_comments
// 字段：id, created_at, post_id, content, user_id, user_email

async function loadCvComments(postId, listEl, infoEl) {
  if (!ensureSupabase()) return;

  listEl.innerHTML = "评论加载中...";

  const { data, error } = await supabaseClient
    .from("cv_comments")
    .select("id, content, user_email, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("加载求职评论失败：", error);
    listEl.textContent = "评论加载失败。";
    infoEl.textContent = "";
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
    meta.textContent = `${c.user_email || "匿名"} · ${cvFormatDate(
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

async function submitCvComment(postId, textarea, statusEl, listEl, infoEl) {
  const content = textarea.value.trim();
  if (!content) {
    statusEl.textContent = "评论内容不能为空。";
    statusEl.style.color = "red";
    return;
  }

  if (!ensureSupabase()) return;

  statusEl.textContent = "正在提交评论...";
  statusEl.style.color = "#6b7280";

  const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
  if (userErr || !userData?.user) {
    alert("请先登录后再发表评论。");
    window.location.href = "login.html";
    return;
  }
  const user = userData.user;

  const { error } = await supabaseClient.from("cv_comments").insert({
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

  textarea.value = "";
  statusEl.textContent = "评论已发表。";
  statusEl.style.color = "green";

  await loadCvComments(postId, listEl, infoEl);
}

/* ============ 详情弹窗：点击帖子查看 ============ */

function showCvDetail(cv) {
  const old = document.getElementById("cvDetailOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "cvDetailOverlay";
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
  titleEl.textContent = cv.title || "匿名求职";
  titleEl.style.margin = "0 0 8px 0";
  titleEl.style.fontSize = "18px";

  const metaEl = document.createElement("div");
  metaEl.style.fontSize = "13px";
  metaEl.style.color = "#6b7280";
  metaEl.style.marginBottom = "10px";
  metaEl.textContent = cv.created_at
    ? `发布于：${cvFormatDate(cv.created_at)}`
    : "";

  const infoEl = document.createElement("div");
  infoEl.style.fontSize = "14px";
  infoEl.style.color = "#111827";
  infoEl.style.lineHeight = "1.6";
  infoEl.innerHTML = `
    ${cv.contact ? `<p><strong>联系方式：</strong>${cv.contact}</p>` : ""}
    ${
      cv.content
        ? `<p style="margin-top:8px;white-space:pre-wrap;">${cv.content}</p>`
        : ""
    }
  `;

  // 图片展示：查看大图 + 保存
  const imagesWrapper = document.createElement("div");
  if (Array.isArray(cv.images) && cv.images.length > 0) {
    imagesWrapper.style.marginTop = "14px";
    imagesWrapper.style.display = "grid";
    imagesWrapper.style.gridTemplateColumns =
      "repeat(auto-fill,minmax(160px,1fr))";
    imagesWrapper.style.gap = "10px";

    cv.images.forEach((src, idx) => {
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
      img.alt = "求职相关图片";
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
      saveLink.download = `cv-image-${cv.id || "p"}-${idx + 1}.png`;
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

  // 评论区
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
  textarea.placeholder = "写下你的评论，例如：想联系这位求职者。";
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

  submitBtn.addEventListener("click", () =>
    submitCvComment(cv.id, textarea, statusSpan, commentList, commentInfo)
  );

  actionRow.appendChild(statusSpan);
  actionRow.appendChild(submitBtn);
  commentForm.appendChild(textarea);
  commentForm.appendChild(actionRow);

  commentBlock.appendChild(commentTitle);
  commentBlock.appendChild(commentInfo);
  commentBlock.appendChild(commentList);
  commentBlock.appendChild(commentForm);

  // 组装 card
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

  // 打开后加载评论
  loadCvComments(cv.id, commentList, commentInfo);
}

/* ============ 图片预览（原逻辑不动） ============ */

function updateCvPreview() {
  const previewEl = document.getElementById("cvPreview");
  if (!previewEl) return;

  previewEl.innerHTML = "";

  cvImagesList.forEach((file, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";

    const img = document.createElement("img");
    img.style.width = "90px";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "8px";
    img.style.border = "1px solid #d1e5d4";

    const reader = new FileReader();
    reader.onload = (e) => (img.src = e.target.result);
    reader.readAsDataURL(file);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.className = "preview-remove";
    removeBtn.addEventListener("click", () => {
      cvImagesList.splice(index, 1);
      updateCvPreview();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    previewEl.appendChild(wrapper);
  });
}

/* ============ 加载求职列表（只加点击事件） ============ */

async function loadCvs() {
  const listEl = document.getElementById("cvList");
  if (!listEl) return;

  listEl.innerHTML = "加载中...";

  if (!ensureSupabase()) {
    listEl.textContent = "系统配置错误，无法加载数据。";
    return;
  }

  const { data, error } = await supabaseClient
    .from("cv_posts")
    .select("id, title, contact, content, images, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("加载求职信息失败：", error);
    listEl.textContent = "加载失败，请稍后重试。";
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<p style="font-size:13px;color:#6b7280;">目前还没有求职信息，欢迎发布第一条。</p>';
    return;
  }

  listEl.innerHTML = "";

  data.forEach((cv) => {
    const div = document.createElement("div");
    div.className = "post";
    div.style.cursor = "pointer"; // 新增：表明可点击

    const createdAt = cv.created_at ? new Date(cv.created_at) : new Date();
    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

    let imagesHtml = "";
    if (Array.isArray(cv.images) && cv.images.length > 0) {
      imagesHtml = `
        <div class="cv-photos">
          ${cv.images
            .map(
              (url) => `<img src="${url}" alt="求职相关图片" loading="lazy" />`
            )
            .join("")}
        </div>
      `;
    }

    div.innerHTML = `
      <h3>${cv.title || "匿名求职"}</h3>
      ${cv.contact ? `<p><strong>联系方式：</strong>${cv.contact}</p>` : ""}
      ${
        cv.content
          ? `<p style="white-space:pre-wrap;">${cv.content}</p>`
          : ""
      }
      ${imagesHtml}
      <small>发布于：${dateStr}</small>
    `;

    // 新增：点击查看详情（含图片 + 评论）
    div.addEventListener("click", () => showCvDetail(cv));

    listEl.appendChild(div);
  });
}

/* ============ 表单逻辑（保持不变） ============ */

function setupCvForm() {
  const form = document.getElementById("cvForm");
  const statusEl = document.getElementById("cvStatus");
  const imagesInput = document.getElementById("cvImages");
  const clearBtn = document.getElementById("cvClearImages");

  if (!form || !statusEl) return;

  if (imagesInput) {
    imagesInput.addEventListener("change", (e) => {
      const newFiles = Array.from(e.target.files || []);
      for (const file of newFiles) {
        if (cvImagesList.length >= CV_MAX_IMAGES) break;
        cvImagesList.push(file);
      }
      imagesInput.value = "";
      updateCvPreview();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      cvImagesList = [];
      updateCvPreview();
      if (imagesInput) imagesInput.value = "";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureSupabase()) return;

    const titleEl = document.getElementById("cvTitle");
    const contactEl = document.getElementById("cvContact");
    const contentEl = document.getElementById("cvContent");

    const title = titleEl.value.trim();
    const contact = contactEl.value.trim();
    const content = contentEl.value.trim();

    if (!title) {
      statusEl.textContent = "职位方向 / 标题是必填项。";
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

    // 登录检查
    const { data: userData, error: userErr } =
      await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      alert("请先登录后再发布求职信息。");
      window.location.href = "login.html";
      return;
    }
    const user = userData.user;

    // 处理图片
    let imageDataUrls = [];
    try {
      if (cvImagesList.length > 0) {
        imageDataUrls = await cvFilesToBase64(
          cvImagesList.slice(0, CV_MAX_IMAGES)
        );
      }
    } catch (err) {
      console.error("读取图片失败：", err);
      statusEl.textContent = "读取图片失败，请重试。";
      statusEl.style.color = "red";
      return;
    }

    const payload = {
      title,
      contact,
      content,
      images: imageDataUrls,
      user_id: user.id,
      user_email: user.email,
    };

    const { error } = await supabaseClient.from("cv_posts").insert(payload);

    if (error) {
      console.error("发布求职失败：", error);
      statusEl.textContent = "发布失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    form.reset();
    cvImagesList = [];
    updateCvPreview();

    statusEl.textContent = "求职信息已发布。";
    statusEl.style.color = "green";

    loadCvs();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadCvs();
  setupCvForm();
});
