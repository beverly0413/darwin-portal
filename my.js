// my.js —— 用户资料、帖子、评论、私信管理

const sb = window.supabaseClient || null;

const POST_TABLES = {
  jobs: { name: "jobs_posts", label: "招聘", titleFallback: "未命名职位" },
  cv: { name: "cv_posts", label: "求职", titleFallback: "未命名求职" },
  rent: { name: "rent_posts", label: "租房", titleFallback: "未命名房源" },
  forum: { name: "forum_posts", label: "论坛", titleFallback: "Biu一下" },
};

const COMMENT_TABLES = {
  jobs: { name: "jobs_comments", label: "招聘评论" },
  cv: { name: "cv_comments", label: "求职评论" },
  rent: { name: "rent_comments", label: "租房评论" },
  forum: { name: "forum_comments", label: "论坛评论" },
};

let currentUser = null;
let currentProfile = null;
let myPosts = [];
let myComments = [];
let myMessages = [];

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function displayName(profile = currentProfile, user = currentUser) {
  const nickname = String(profile?.nickname || "").trim();
  if (nickname) return nickname;
  const emailName = String(user?.email || "Darwin用户").split("@")[0];
  return emailName || "Darwin用户";
}

function initials(name) {
  return String(name || "D").trim().slice(0, 2).toUpperCase();
}

function getEl(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = getEl(id);
  if (el) el.textContent = text;
}

function profilePayloadFromForm() {
  const ageRaw = getEl("profileAge")?.value.trim();
  const age = ageRaw ? Number(ageRaw) : null;
  return {
    id: currentUser.id,
    email: currentUser.email,
    nickname: getEl("profileNickname")?.value.trim() || null,
    age: Number.isFinite(age) ? age : null,
    gender: getEl("profileGender")?.value || "private",
    avatar_url: getEl("profileAvatar")?.value.trim() || null,
    bio: getEl("profileBio")?.value.trim() || null,
    updated_at: new Date().toISOString(),
  };
}

async function ensureProfile() {
  const { data, error } = await sb
    .from("profiles")
    .select("id, email, nickname, age, gender, avatar_url, bio")
    .eq("id", currentUser.id)
    .maybeSingle();

  if (error) throw error;
  if (data) return data;

  const fallbackName = "Darwin" + String(currentUser.email || "user").split("@")[0].slice(0, 6);
  const payload = {
    id: currentUser.id,
    email: currentUser.email,
    nickname: fallbackName,
    gender: "private",
  };
  const { data: created, error: createError } = await sb
    .from("profiles")
    .upsert(payload)
    .select("id, email, nickname, age, gender, avatar_url, bio")
    .single();

  if (createError) throw createError;
  return created;
}

function renderProfile() {
  const name = displayName();
  setText("profileName", name);
  setText("profileEmail", currentUser?.email || "");
  setText("userInfo", `当前登录：${currentUser?.email || ""}`);

  const avatarImg = getEl("profileAvatarImg");
  const avatarInitials = getEl("profileAvatarInitials");
  const avatarUrl = String(currentProfile?.avatar_url || "").trim();

  if (avatarImg && avatarInitials) {
    if (avatarUrl) {
      avatarImg.src = avatarUrl;
      avatarImg.style.display = "block";
      avatarInitials.style.display = "none";
    } else {
      avatarImg.removeAttribute("src");
      avatarImg.style.display = "none";
      avatarInitials.style.display = "grid";
      avatarInitials.textContent = initials(name);
    }
  }

  if (getEl("profileNickname")) getEl("profileNickname").value = currentProfile?.nickname || "";
  if (getEl("profileAge")) getEl("profileAge").value = currentProfile?.age || "";
  if (getEl("profileGender")) getEl("profileGender").value = currentProfile?.gender || "private";
  if (getEl("profileAvatar")) getEl("profileAvatar").value = currentProfile?.avatar_url || "";
  if (getEl("profileBio")) getEl("profileBio").value = currentProfile?.bio || "";
}

async function saveProfile() {
  if (!currentUser) return;
  const statusEl = getEl("profileStatus");
  const payload = profilePayloadFromForm();

  if (payload.age !== null && (payload.age < 13 || payload.age > 120)) {
    statusEl.textContent = "年龄请填写 13 到 120 之间的数字。";
    statusEl.style.color = "red";
    return;
  }

  statusEl.textContent = "正在保存资料...";
  statusEl.style.color = "#6b7280";

  const { data, error } = await sb
    .from("profiles")
    .upsert(payload)
    .select("id, email, nickname, age, gender, avatar_url, bio")
    .single();

  if (error) {
    console.error("保存资料失败：", error);
    statusEl.textContent = "保存失败。请确认 Supabase 已运行 supabase-user-system.sql。";
    statusEl.style.color = "red";
    return;
  }

  currentProfile = data;
  localStorage.setItem("dlh_nickname", data.nickname || "");
  renderProfile();
  statusEl.textContent = "资料已保存。";
  statusEl.style.color = "#15803d";
}

function renderMyPosts() {
  const listEl = getEl("myPostsList");
  const statusEl = getEl("myPostsStatus");
  if (!listEl || !statusEl) return;

  listEl.innerHTML = "";
  if (!myPosts.length) {
    statusEl.textContent = "你还没有发布任何信息。";
    return;
  }

  statusEl.textContent = `你共发布了 ${myPosts.length} 条信息。`;
  myPosts.forEach((post) => {
    const title = post.title || POST_TABLES[post.typeKey].titleFallback;
    const summary = post.content ? String(post.content).slice(0, 100) : "";
    const item = document.createElement("article");
    item.className = "manage-item";
    item.innerHTML = `
      <div>
        <div class="item-kicker">${post.typeLabel} · ${formatDate(post.createdAt)}</div>
        <h3>${escapeHtml(title)}</h3>
        ${summary ? `<p>${escapeHtml(summary)}${post.content.length > 100 ? "..." : ""}</p>` : ""}
      </div>
      <button class="danger-btn" type="button">删除</button>
    `;
    item.querySelector("button").addEventListener("click", () => deletePost(post));
    listEl.appendChild(item);
  });
}

async function loadMyPosts() {
  const uid = currentUser.id;
  const results = await Promise.all(
    Object.entries(POST_TABLES).map(([key, info]) =>
      sb
        .from(info.name)
        .select("id, title, company, contact, content, images, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error(`加载 ${info.name} 失败：`, error);
            return [];
          }
          return (data || []).map((row) => ({
            id: row.id,
            typeKey: key,
            typeLabel: info.label,
            title: row.title || "",
            content: row.content || "",
            createdAt: row.created_at,
          }));
        })
    )
  );

  myPosts = results.flat().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  renderMyPosts();
}

async function deletePost(post) {
  if (!confirm("确认删除这条发布吗？删除后不可恢复。")) return;
  const table = POST_TABLES[post.typeKey]?.name;
  if (!table) return;

  const { data, error } = await sb
    .from(table)
    .delete()
    .eq("id", post.id)
    .eq("user_id", currentUser.id)
    .select("id");

  if (error || !data?.length) {
    console.error("删除发布失败：", error);
    alert("删除失败，请确认你有删除权限。");
    return;
  }

  myPosts = myPosts.filter((p) => !(p.id === post.id && p.typeKey === post.typeKey));
  renderMyPosts();
}

function renderMyComments() {
  const listEl = getEl("myCommentsList");
  const statusEl = getEl("myCommentsStatus");
  if (!listEl || !statusEl) return;

  listEl.innerHTML = "";
  if (!myComments.length) {
    statusEl.textContent = "你还没有发表过评论。";
    return;
  }

  statusEl.textContent = `你共发表了 ${myComments.length} 条评论。`;
  myComments.forEach((comment) => {
    const item = document.createElement("article");
    item.className = "manage-item";
    item.innerHTML = `
      <div>
        <div class="item-kicker">${comment.typeLabel} · ${formatDate(comment.createdAt)}</div>
        <p>${escapeHtml(comment.content)}</p>
      </div>
      <button class="danger-btn" type="button">删除</button>
    `;
    item.querySelector("button").addEventListener("click", () => deleteComment(comment));
    listEl.appendChild(item);
  });
}

async function loadMyComments() {
  const uid = currentUser.id;
  const results = await Promise.all(
    Object.entries(COMMENT_TABLES).map(([key, info]) =>
      sb
        .from(info.name)
        .select("id, content, created_at")
        .eq("user_id", uid)
        .order("created_at", { ascending: false })
        .then(({ data, error }) => {
          if (error) {
            console.error(`加载 ${info.name} 失败：`, error);
            return [];
          }
          return (data || []).map((row) => ({
            id: row.id,
            typeKey: key,
            typeLabel: info.label,
            content: row.content || "",
            createdAt: row.created_at,
          }));
        })
    )
  );

  myComments = results.flat().sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  renderMyComments();
}

async function deleteComment(comment) {
  if (!confirm("确认删除这条评论吗？")) return;
  const table = COMMENT_TABLES[comment.typeKey]?.name;
  if (!table) return;

  const { data, error } = await sb
    .from(table)
    .delete()
    .eq("id", comment.id)
    .eq("user_id", currentUser.id)
    .select("id");

  if (error || !data?.length) {
    console.error("删除评论失败：", error);
    alert("删除失败，请确认你有删除权限。");
    return;
  }

  myComments = myComments.filter((c) => !(c.id === comment.id && c.typeKey === comment.typeKey));
  renderMyComments();
}

function renderMessages() {
  const listEl = getEl("myMessagesList");
  const statusEl = getEl("myMessagesStatus");
  if (!listEl || !statusEl) return;

  listEl.innerHTML = "";
  if (!myMessages.length) {
    statusEl.textContent = "暂时没有私信。";
    return;
  }

  statusEl.textContent = `共有 ${myMessages.length} 条私信。`;
  myMessages.forEach((message) => {
    const isInbox = message.receiver_id === currentUser.id;
    const name = isInbox
      ? message.sender_profile?.nickname || "对方"
      : message.receiver_profile?.nickname || "对方";
    const item = document.createElement("article");
    item.className = "manage-item";
    item.innerHTML = `
      <div>
        <div class="item-kicker">${isInbox ? "收到" : "发出"} · ${escapeHtml(name)} · ${formatDate(message.created_at)}</div>
        <p>${escapeHtml(message.content)}</p>
      </div>
      <button class="danger-btn" type="button">删除</button>
    `;
    item.querySelector("button").addEventListener("click", () => deleteMessage(message.id));
    listEl.appendChild(item);
  });
}

async function loadMessages() {
  const statusEl = getEl("myMessagesStatus");
  const { data, error } = await sb
    .from("user_messages")
    .select(`
      id, sender_id, receiver_id, content, is_read, created_at,
      sender_profile:profiles!user_messages_sender_id_fkey(nickname, avatar_url),
      receiver_profile:profiles!user_messages_receiver_id_fkey(nickname, avatar_url)
    `)
    .or(`sender_id.eq.${currentUser.id},receiver_id.eq.${currentUser.id}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("加载私信失败：", error);
    if (statusEl) statusEl.textContent = "私信表还未启用。请先在 Supabase 运行 supabase-user-system.sql。";
    return;
  }

  myMessages = data || [];
  renderMessages();
}

async function deleteMessage(id) {
  if (!confirm("确认删除这条私信吗？")) return;
  const { error } = await sb.from("user_messages").delete().eq("id", id);
  if (error) {
    console.error("删除私信失败：", error);
    alert("删除失败，请稍后再试。");
    return;
  }
  myMessages = myMessages.filter((m) => m.id !== id);
  renderMessages();
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.remove("active"));
      btn.classList.add("active");
      getEl(btn.dataset.tab)?.classList.add("active");
    });
  });
}

async function initMyPage() {
  const logoutBtn = getEl("logoutBtn");
  const saveBtn = getEl("saveProfileBtn");

  if (!sb) {
    alert("系统错误：未找到 Supabase 登录模块。");
    return;
  }

  const { data, error } = await sb.auth.getUser();
  if (error || !data?.user) {
    alert("请先登录后再访问“我的”页面。");
    window.location.href = "login.html";
    return;
  }

  currentUser = data.user;

  try {
    currentProfile = await ensureProfile();
  } catch (err) {
    console.error("读取资料失败：", err);
    currentProfile = { nickname: localStorage.getItem("dlh_nickname") || "" };
    setText("profileStatus", "资料表未启用。请先运行 supabase-user-system.sql。");
  }

  renderProfile();
  setupTabs();

  saveBtn?.addEventListener("click", saveProfile);
  logoutBtn?.addEventListener("click", async () => {
    await sb.auth.signOut();
    window.location.href = "index.html";
  });

  await Promise.all([loadMyPosts(), loadMyComments(), loadMessages()]);
}

document.addEventListener("DOMContentLoaded", initMyPage);
