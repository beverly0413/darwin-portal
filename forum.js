// 真实社区讨论：沿用 forum_posts / forum_comments；不创建用户或模拟互动。
const FORUM_MAX_IMAGES = 5;
const FORUM_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const FORUM_MAX_TITLE = 80;
const FORUM_MAX_CONTENT = 5000;
const FORUM_MAX_COMMENT = 1000;
const FORUM_PAGE_SIZE = 100;
let forumImagesList = [];
let forumPosts = [];
let forumSearchTerm = "";
let forumLoadState = "idle";
let forumLoadVersion = 0;
let forumPosting = false;

function ensureSupabase() {
  return Boolean(window.supabaseClient);
}

function formatDate(iso) {
  if (!iso || Number.isNaN(new Date(iso).getTime())) return "日期未提供";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Australia/Darwin", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso));
}

function forumPostTitle(post) {
  const title = typeof post.title === "string" ? post.title.trim() : "";
  if (title && title !== "Biu一下") return title;
  const firstLine = String(post.content || "").trim().split(/\r?\n/)[0];
  return firstLine ? firstLine.slice(0, 48) + (firstLine.length > 48 ? "…" : "") : "未命名讨论";
}

// Only raster image data and ordinary web URLs can be displayed or opened.
function safeForumImage(value) {
  if (typeof value !== "string" || !value || /[\u0000-\u0020\u007f]/.test(value)) return "";
  if (/^data:image\/(?:png|jpeg|gif|webp|avif|bmp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(value)) return value;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.href : "";
  } catch { return ""; }
}

function forumPostImages(post) {
  return Array.isArray(post.images) ? post.images.map(safeForumImage).filter(Boolean) : [];
}

function forumNode(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function forumSetStatus(node, text, error = false) {
  node.textContent = text;
  node.style.color = error ? "#b91c1c" : "#475569";
}

async function loadCommentProfiles(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return {};
  try {
    const { data, error } = await window.supabaseClient.from("profiles").select("id, nickname").in("id", ids);
    if (error) throw error;
    return Object.fromEntries((data || []).map((profile) => [profile.id, profile]));
  } catch (error) {
    console.error("加载评论用户资料失败：", error);
    return {};
  }
}

function forumFilesToBase64(files) {
  return Promise.all(files.map((file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => resolve(event.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  })));
}

/* ============= 评论 ============= */
async function loadComments(postId, listEl, infoEl) {
  const version = (listEl.forumLoadVersion || 0) + 1;
  listEl.forumLoadVersion = version;
  listEl.textContent = "评论加载中…";
  infoEl.textContent = "";
  try {
    if (!ensureSupabase()) throw new Error("Forum service unavailable");
    const { data, error } = await window.supabaseClient.from("forum_comments")
      .select("id, content, user_id, created_at").eq("post_id", postId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    if (!Array.isArray(data)) throw new Error("Invalid comment response");
    const profiles = await loadCommentProfiles(data.map((comment) => comment.user_id));
    if (listEl.forumLoadVersion !== version) return;
    listEl.innerHTML = "";
    if (!data.length) {
      listEl.textContent = "还没有评论，欢迎分享你的经验。";
      return;
    }
    infoEl.textContent = `共 ${data.length} 条评论`;
    data.forEach((comment) => {
      const item = forumNode("div", undefined, "forum-comment");
      const nickname = profiles[comment.user_id]?.nickname || "Darwin用户";
      item.appendChild(forumNode("p", `${nickname} · ${formatDate(comment.created_at)}`, "forum-meta"));
      item.appendChild(forumNode("p", comment.content || "", "forum-text"));
      listEl.appendChild(item);
    });
  } catch (error) {
    if (listEl.forumLoadVersion !== version) return;
    console.error("加载评论失败：", error);
    listEl.innerHTML = "";
    listEl.appendChild(forumNode("p", "评论暂时无法加载，请重试。"));
    const retry = forumNode("button", "重试评论");
    retry.type = "button";
    retry.addEventListener("click", () => loadComments(postId, listEl, infoEl));
    listEl.appendChild(retry);
  }
}

async function submitComment(postId, textarea, statusEl, listEl, infoEl, submitBtn) {
  if (textarea.forumSubmitting) return;
  const content = textarea.value.trim();
  if (!content || content.length > FORUM_MAX_COMMENT) {
    forumSetStatus(statusEl, `请填写 1–${FORUM_MAX_COMMENT} 字的评论。`, true);
    return;
  }
  textarea.forumSubmitting = true;
  textarea.disabled = true;
  if (submitBtn) submitBtn.disabled = true;
  forumSetStatus(statusEl, "正在提交评论…");
  try {
    if (!ensureSupabase()) throw new Error("Forum service unavailable");
    const client = window.supabaseClient;
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) {
      forumSetStatus(statusEl, "请先登录，再返回这里发表评论。草稿仍保留。", true);
      return;
    }
    const user = userData.user;
    const { error } = await client.from("forum_comments").insert({
      post_id: postId, content, user_id: user.id, user_email: user.email,
    });
    if (error) throw error;
    textarea.value = "";
    forumSetStatus(statusEl, "评论已发表。");
    await loadComments(postId, listEl, infoEl);
  } catch (error) {
    console.error("发表评论失败：", error);
    forumSetStatus(statusEl, "未能确认评论是否发表。请刷新评论确认后再试，避免重复提交。草稿仍保留。", true);
  } finally {
    textarea.forumSubmitting = false;
    textarea.disabled = false;
    if (submitBtn) submitBtn.disabled = false;
  }
}

/* ============= 详情弹窗 ============= */
function showForumDetail(post) {
  const old = document.getElementById("forumDetailOverlay");
  if (old) old.forumClose();
  const previousFocus = document.activeElement;
  const overlay = forumNode("div", undefined, "forum-overlay");
  overlay.id = "forumDetailOverlay";
  const card = forumNode("section", undefined, "forum-dialog");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  card.setAttribute("aria-labelledby", "forumDetailTitle");
  const close = () => {
    document.removeEventListener("keydown", onKeyDown);
    overlay.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  };
  overlay.forumClose = close;
  const onKeyDown = (event) => {
    if (event.key === "Escape") close();
    if (event.key !== "Tab") return;
    const focusable = Array.from(card.querySelectorAll("button, a[href], textarea")).filter((node) => !node.disabled);
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  const closeBtn = forumNode("button", "×", "forum-close");
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "关闭讨论详情");
  closeBtn.addEventListener("click", close);
  const title = forumNode("h2", forumPostTitle(post));
  title.id = "forumDetailTitle";
  card.appendChild(closeBtn);
  card.appendChild(title);
  card.appendChild(forumNode("p", `发布于：${formatDate(post.created_at)} · 达尔文时间`, "forum-meta"));
  card.appendChild(forumNode("div", post.content || "", "forum-text"));

  const images = forumNode("div", undefined, "forum-detail-photos");
  forumPostImages(post).forEach((src, index) => {
    const box = forumNode("div");
    const image = forumNode("img");
    image.src = src;
    image.alt = `讨论配图 ${index + 1}`;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    const view = forumNode("a", "查看大图");
    view.href = src;
    view.target = "_blank";
    view.rel = "noopener noreferrer";
    const save = forumNode("a", "保存图片");
    save.href = src;
    save.download = `forum-image-${index + 1}`;
    box.appendChild(image);
    box.appendChild(view);
    box.appendChild(save);
    images.appendChild(box);
  });
  if (images.childElementCount) card.appendChild(images);

  const commentBlock = forumNode("div", undefined, "forum-comments");
  commentBlock.appendChild(forumNode("h3", "评论"));
  const info = forumNode("div", "", "forum-meta");
  const list = forumNode("div");
  list.setAttribute("aria-live", "polite");
  const label = forumNode("label", "分享你的经验或补充信息");
  label.htmlFor = "forumCommentContent";
  const textarea = forumNode("textarea");
  textarea.id = "forumCommentContent";
  textarea.rows = 3;
  textarea.maxLength = FORUM_MAX_COMMENT;
  textarea.placeholder = "请友善交流，不要公开个人敏感信息";
  const status = forumNode("p", "", "forum-meta");
  status.setAttribute("role", "status");
  const submit = forumNode("button", "发表评论");
  submit.type = "button";
  submit.addEventListener("click", () => submitComment(post.id, textarea, status, list, info, submit));
  const login = forumNode("a", "登录后可参与讨论", "forum-login-link");
  login.href = "login.html";
  login.target = "_blank";
  login.rel = "noopener noreferrer";
  for (const node of [info, list, label, textarea, status, submit, login]) commentBlock.appendChild(node);
  card.appendChild(commentBlock);
  overlay.appendChild(card);
  overlay.addEventListener("click", (event) => { if (event.target === overlay) close(); });
  document.body.appendChild(overlay);
  document.addEventListener("keydown", onKeyDown);
  closeBtn.focus();
  loadComments(post.id, list, info);
}

/* ============= 列表与搜索 ============= */
function renderForumPosts() {
  const list = document.getElementById("posts");
  const status = document.getElementById("forumListStatus");
  const retry = document.getElementById("forumRetry");
  if (!list || !status) return;
  list.innerHTML = "";
  list.setAttribute("aria-busy", String(forumLoadState === "loading"));
  if (retry) { retry.hidden = forumLoadState !== "error"; retry.disabled = forumLoadState === "loading"; }
  if (forumLoadState === "loading") { status.textContent = "正在加载社区讨论…"; return; }
  if (forumLoadState === "error") { status.textContent = "社区讨论暂时无法加载，请重试。"; return; }
  if (forumLoadState !== "ready") { status.textContent = "等待加载社区讨论…"; return; }
  const terms = forumSearchTerm.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const visible = forumPosts.filter((post) => {
    const text = `${forumPostTitle(post)}\n${post.content || ""}`.toLocaleLowerCase();
    return terms.every((term) => text.includes(term));
  });
  if (!forumPosts.length) { status.textContent = "还没有公开讨论，欢迎发布第一个话题。"; return; }
  if (!visible.length) { status.textContent = "没有找到匹配的讨论，试试其他关键词。"; return; }
  status.textContent = terms.length ? `找到 ${visible.length} 条讨论（已加载 ${forumPosts.length} 条）` : `共 ${forumPosts.length} 条讨论 · 最新发布在前`;
  visible.forEach((post) => {
    const card = forumNode("article", undefined, "post-card");
    const heading = forumNode("h3");
    const open = forumNode("button", forumPostTitle(post), "forum-post-title");
    open.type = "button";
    open.addEventListener("click", () => showForumDetail(post));
    heading.appendChild(open);
    card.appendChild(heading);
    const content = String(post.content || "");
    card.appendChild(forumNode("p", content.slice(0, 180) + (content.length > 180 ? "…" : ""), "forum-text"));
    const images = forumPostImages(post);
    if (images.length) {
      const photos = forumNode("div", undefined, "forum-photos");
      images.slice(0, 3).forEach((src, index) => {
        const image = forumNode("img");
        image.src = src;
        image.alt = `讨论配图 ${index + 1}`;
        image.loading = "lazy";
        image.referrerPolicy = "no-referrer";
        photos.appendChild(image);
      });
      if (images.length > 3) photos.appendChild(forumNode("span", `另有 ${images.length - 3} 张图片`));
      card.appendChild(photos);
    }
    card.appendChild(forumNode("p", `发布于：${formatDate(post.created_at)}`, "forum-meta"));
    list.appendChild(card);
  });
}

async function loadForumPosts() {
  const version = ++forumLoadVersion;
  forumLoadState = "loading";
  forumPosts = [];
  renderForumPosts();
  try {
    if (!ensureSupabase()) throw new Error("Forum service unavailable");
    const posts = [];
    for (let start = 0; ; start += FORUM_PAGE_SIZE) {
      const { data, error } = await window.supabaseClient.from("forum_posts")
        .select("id, title, content, images, created_at")
        .order("created_at", { ascending: false }).order("id", { ascending: false })
        .range(start, start + FORUM_PAGE_SIZE - 1);
      if (version !== forumLoadVersion) return;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Invalid forum response");
      posts.push(...data);
      if (data.length < FORUM_PAGE_SIZE) break;
    }
    // Pagination can overlap when a new post is added while the list is loading.
    forumPosts = [...new Map(posts.map((post) => [post.id, post])).values()];
    forumLoadState = "ready";
  } catch (error) {
    if (version !== forumLoadVersion) return;
    console.error("加载帖子失败：", error);
    forumLoadState = "error";
  }
  renderForumPosts();
}

/* ============= 发帖 ============= */
function updateForumPreview() {
  const preview = document.getElementById("forumPreview");
  if (!preview) return;
  preview.innerHTML = "";
  forumImagesList.forEach((file, index) => {
    const wrap = forumNode("div", undefined, "preview-item");
    const image = forumNode("img");
    image.alt = `待发布配图 ${index + 1}`;
    const reader = new FileReader();
    reader.onload = (event) => { image.src = safeForumImage(event.target.result); };
    reader.readAsDataURL(file);
    const remove = forumNode("button", "×", "preview-remove");
    remove.type = "button";
    remove.setAttribute("aria-label", `移除第 ${index + 1} 张配图`);
    remove.disabled = forumPosting;
    remove.addEventListener("click", () => { if (!forumPosting) { forumImagesList.splice(index, 1); updateForumPreview(); } });
    wrap.appendChild(image);
    wrap.appendChild(remove);
    preview.appendChild(wrap);
  });
}

function forumDarwinDayBounds(now = Date.now()) {
  const day = new Date(now + 9.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const start = Date.parse(`${day}T00:00:00+09:30`);
  return { start: new Date(start).toISOString(), end: new Date(start + 86400000).toISOString() };
}

function setupForumForm() {
  const form = document.getElementById("forumForm");
  const status = document.getElementById("forumStatus");
  const input = document.getElementById("forumImages");
  const clear = document.getElementById("forumClearImages");
  if (!form || !status) return;
  if (input) input.onchange = (event) => {
    if (forumPosting) return;
    let skipped = 0;
    for (const file of Array.from(event.target.files || [])) {
      if (!/^image\/(?:png|jpeg|gif|webp|avif|bmp)$/.test(file.type) || file.size > FORUM_MAX_IMAGE_BYTES || forumImagesList.length >= FORUM_MAX_IMAGES) { skipped++; continue; }
      forumImagesList.push(file);
    }
    input.value = "";
    updateForumPreview();
    forumSetStatus(status, skipped ? "部分图片未加入。请选择 JPG、PNG、GIF、WebP、AVIF 或 BMP，每张不超过 5MB，最多 5 张。" : "", Boolean(skipped));
  };
  if (clear) clear.onclick = () => {
    if (forumPosting) return;
    forumImagesList = [];
    updateForumPreview();
    if (input) input.value = "";
  };
  form.onsubmit = async (event) => {
    event.preventDefault();
    if (forumPosting) return;
    const title = document.getElementById("forumTitle").value.trim();
    const content = document.getElementById("content").value.trim();
    if (!title || title.length > FORUM_MAX_TITLE || !content || content.length > FORUM_MAX_CONTENT) {
      forumSetStatus(status, `请填写 1–${FORUM_MAX_TITLE} 字的标题和 1–${FORUM_MAX_CONTENT} 字的正文。`, true);
      return;
    }
    forumPosting = true;
    const controls = Array.from(form.querySelectorAll("input, textarea, button"));
    const disabledStates = controls.map((control) => control.disabled);
    controls.forEach((control) => { control.disabled = true; });
    forumSetStatus(status, "正在发布讨论…");
    try {
      if (!ensureSupabase()) throw new Error("Forum service unavailable");
      const client = window.supabaseClient;
      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError || !userData?.user) { forumSetStatus(status, "请先登录，再返回这里发布。草稿仍保留。", true); return; }
      const user = userData.user;
      // Existing per-day form check only; this is not a server-enforced anti-spam control.
      const day = forumDarwinDayBounds();
      const { count, error: countError } = await client.from("forum_posts")
        .select("id", { count: "exact", head: true }).eq("user_id", user.id)
        .gte("created_at", day.start).lt("created_at", day.end);
      if (countError || !Number.isInteger(count) || count < 0) {
        forumSetStatus(status, "暂时无法检查今日发帖数量，请稍后再试。草稿仍保留。", true); return;
      }
      if (count >= 3) { forumSetStatus(status, "当前表单每日最多提交 3 条讨论（达尔文时间），请明天再来。草稿仍保留。", true); return; }
      const images = await forumFilesToBase64(forumImagesList.slice(0, FORUM_MAX_IMAGES));
      const { error } = await client.from("forum_posts").insert({
        title, content, images, user_id: user.id, user_email: user.email,
      });
      if (error) throw error;
      form.reset();
      forumImagesList = [];
      updateForumPreview();
      forumSetStatus(status, "讨论已发布。");
      await loadForumPosts();
    } catch (error) {
      console.error("发布讨论失败：", error);
      forumSetStatus(status, "未能确认讨论是否发布。请刷新列表确认后再试，避免重复提交。草稿仍保留。", true);
    } finally {
      forumPosting = false;
      controls.forEach((control, index) => { control.disabled = disabledStates[index]; });
    }
  };
}

document.addEventListener("DOMContentLoaded", () => {
  const search = document.getElementById("forumSearch");
  if (search) search.addEventListener("input", () => { forumSearchTerm = search.value; renderForumPosts(); });
  const retry = document.getElementById("forumRetry");
  if (retry) retry.addEventListener("click", loadForumPosts);
  loadForumPosts();
  setupForumForm();
});
