// rent.js —— Supabase 版租房：列表 + 详情弹窗 + 评论 + 发布
// 表：rent_posts、rent_comments

const MAX_IMAGES = 5;
let rentImagesList = [];   // 当前准备上传的图片 File[]
// ================= 工具函数 =================

// 检查 supabaseClient 是否存在
function ensureSupabase() {
  if (!window.supabaseClient) {
    console.error("supabaseClient 未初始化，请检查公共 supabase 配置脚本。");
    alert("系统配置错误：未找到 supabaseClient。");
    return false;
  }
  return true;
}

// File[] -> base64[]
function filesToBase64(files) {
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

// 时间格式化
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

/* ================= 评论相关：rent_comments ================= */

// 加载某条房源的评论
async function loadRentComments(postId, listEl, infoEl) {
  if (!ensureSupabase()) return;

  listEl.innerHTML = "评论加载中...";

  const { data, error } = await supabaseClient
    .from("rent_comments")
    .select("id, content, user_email, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("加载租房评论失败：", error);
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
async function submitRentComment(postId, textarea, statusEl, listEl, infoEl) {
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

  const { error } = await supabaseClient.from("rent_comments").insert({
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

  await loadRentComments(postId, listEl, infoEl);
}

/* ================= 详情弹窗 ================= */

function showRentDetail(rent) {
  // 清除旧的 overlay
  const old = document.getElementById("rentDetailOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "rentDetailOverlay";
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
  titleEl.textContent = rent.title || "未命名房源";
  titleEl.style.margin = "0 0 8px 0";
  titleEl.style.fontSize = "18px";

  const metaEl = document.createElement("div");
  metaEl.style.fontSize = "13px";
  metaEl.style.color = "#6b7280";
  metaEl.style.marginBottom = "10px";
  metaEl.textContent = rent.created_at
    ? `发布于：${formatDate(rent.created_at)}`
    : "";

  const infoEl = document.createElement("div");
  infoEl.style.fontSize = "14px";
  infoEl.style.color = "#111827";
  infoEl.style.lineHeight = "1.6";
  infoEl.innerHTML = `
    <p><strong>联系方式：</strong>${rent.contact || "未填写"}</p>
    ${
      rent.content
        ? `<p style="margin-top:8px;white-space:pre-wrap;">${rent.content}</p>`
        : ""
    }
  `;

  // 图片区域
  const imagesWrapper = document.createElement("div");
  if (Array.isArray(rent.images) && rent.images.length > 0) {
    imagesWrapper.style.marginTop = "14px";
    imagesWrapper.style.display = "grid";
    imagesWrapper.style.gridTemplateColumns =
      "repeat(auto-fill,minmax(160px,1fr))";
    imagesWrapper.style.gap = "10px";

    rent.images.forEach((src, idx) => {
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
      img.alt = "房源图片";
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
      saveLink.download = `rent-image-${rent.id || "p"}-${idx + 1}.png`;
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
  textarea.placeholder = "写下你的评论，例如：房子还在吗？";
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
    submitRentComment(rent.id, textarea, statusSpan, commentList, commentInfo)
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

  // 打开弹窗后加载评论
  loadRentComments(rent.id, commentList, commentInfo);
}

/* ================= 列表（rent_posts） ================= */

async function loadRents() {
  const listEl = document.getElementById("rentList");
  if (!listEl) return;

  listEl.innerHTML = "加载中...";

  if (!ensureSupabase()) {
    listEl.textContent = "系统配置错误，无法加载数据。";
    return;
  }

  const { data, error } = await supabaseClient
    .from("rent_posts")
    .select("id, title, contact, content, images, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("加载租房列表失败：", error);
    listEl.textContent = "加载失败，请稍后再试。";
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<p style="color:#6b7280;font-size:13px;">目前还没有租房信息，欢迎成为第一位发布者。</p>';
    return;
  }

  listEl.innerHTML = "";

  data.forEach((rent) => {
    const div = document.createElement("div");
    // 方框卡片样式（你也可以只用 CSS 写一个 .rent-card）
    div.style.border = "1px solid #d1e5d4";
    div.style.borderRadius = "12px";
    div.style.background = "#ffffff";
    div.style.padding = "12px 16px";
    div.style.marginBottom = "16px";
    div.style.boxShadow = "0 1px 2px rgba(15,23,42,0.05)";
    div.style.cursor = "pointer";

    const createdAt = rent.created_at ? new Date(rent.created_at) : new Date();
    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

    let summary = rent.content || "";
    if (summary.length > 80) summary = summary.slice(0, 80) + "…";

    div.innerHTML = `
      <h3 style="margin:0 0 4px;">${rent.title || "未命名房源"}</h3>
      <p style="margin:2px 0;"><strong>联系方式：</strong>${
        rent.contact || "未填写"
      }</p>
      ${
        summary
          ? `<p style="margin:4px 0 6px;white-space:pre-wrap;">${summary}</p>`
          : ""
      }
      <small style="color:#6b7280;">发布于：${dateStr}</small>
    `;

    div.addEventListener("click", () => showRentDetail(rent));

    listEl.appendChild(div);
  });
}

/* ================= 图片预览 ================= */

function updateRentPreview() {
  const previewEl = document.getElementById("rentPreview");
  if (!previewEl) return;

  previewEl.innerHTML = "";

  rentImagesList.forEach((file, idx) => {
    const wrapper = document.createElement("div");
    wrapper.style.display = "inline-block";
    wrapper.style.position = "relative";
    wrapper.style.marginRight = "6px";

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
    btn.style.position = "absolute";
    btn.style.top = "0";
    btn.style.right = "0";
    btn.style.border = "none";
    btn.style.background = "rgba(0,0,0,0.5)";
    btn.style.color = "white";
    btn.style.borderRadius = "999px";
    btn.style.cursor = "pointer";
    btn.style.width = "18px";
    btn.style.height = "18px";
    btn.style.fontSize = "12px";
    btn.addEventListener("click", () => {
      rentImagesList.splice(idx, 1);
      updateRentPreview();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(btn);
    previewEl.appendChild(wrapper);
  });
}

/* ================= 发布表单 ================= */

function setupRentForm() {
  const form = document.getElementById("rentForm");
  const statusEl = document.getElementById("rentStatus");
  const input = document.getElementById("rentImages");
  const clearBtn = document.getElementById("rentClearImages");

  if (!form || !statusEl) return;

  // 选择图片
  if (input) {
    input.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      for (const f of files) {
        if (rentImagesList.length < MAX_IMAGES) {
          rentImagesList.push(f);
        }
      }
      input.value = "";
      updateRentPreview();
    });
  }

  // 清空图片
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      rentImagesList = [];
      updateRentPreview();
      if (input) input.value = "";
    });
  }

  // 提交发布
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureSupabase()) return;

    const title = document.getElementById("rentTitle").value.trim();
    const contact = document.getElementById("rentContact").value.trim();
    const content = document.getElementById("rentContent").value.trim();

    if (!title || !contact) {
      statusEl.textContent = "标题和联系方式是必填项。";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "提交中...";
    statusEl.style.color = "#6b7280";

    const { data: userData, error: userErr } = await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      alert("请先登录后再发布房源信息。");
      window.location.href = "login.html";
      return;
    }
    const user = userData.user;

    let imagesBase64 = [];
    try {
      imagesBase64 = await filesToBase64(rentImagesList.slice(0, MAX_IMAGES));
    } catch (err) {
      console.error("读取图片失败：", err);
      statusEl.textContent = "读取图片失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    const payload = {
      title,
      contact,
      content,
      images: imagesBase64,
      user_id: user.id,
      user_email: user.email,
    };

    const { error } = await supabaseClient.from("rent_posts").insert(payload);

    if (error) {
      console.error("发布失败：", error);
      statusEl.textContent = "发布失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "发布成功！";
    statusEl.style.color = "green";

    form.reset();
    rentImagesList = [];
    updateRentPreview();
    loadRents();
  });
}

/* ================= 初始化 ================= */

document.addEventListener("DOMContentLoaded", () => {
  loadRents();
  setupRentForm();
});
