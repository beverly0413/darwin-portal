// my.js —— 从 Supabase 四张表加载“我发布的帖子”，并支持点击查看详情 & 删除
// 需要的表名：jobs_posts / cv_posts / rent_posts / forum_posts
// 如果你的表名不一样，改 TABLES 里的 name 就可以

const supabase = window.supabaseClient || null;

const TABLES = {
  jobs:  { name: "jobs_posts",  label: "招聘" },
  cv:    { name: "cv_posts",    label: "求职" },
  rent:  { name: "rent_posts",  label: "租房" },
  forum: { name: "forum_posts", label: "论坛" },
};

let currentUser = null;
let myPosts = [];

/* ---------------- 公共小工具 ---------------- */

// 格式化时间
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

/* ---------------- 详情弹窗 ---------------- */

function showPostDetail(post) {
  // 先清掉旧的
  const old = document.getElementById("myDetailOverlay");
  if (old) old.remove();

  const overlay = document.createElement("div");
  overlay.id = "myDetailOverlay";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.background = "rgba(15,23,42,0.45)";
  overlay.style.display = "flex";
  overlay.style.alignItems = "center";
  overlay.style.justifyContent = "center";
  overlay.style.zIndex = "1000";

  const card = document.createElement("div");
  card.style.maxWidth = "720px";
  card.style.width = "90%";
  card.style.maxHeight = "85vh";
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
  closeBtn.style.top = "10px";
  closeBtn.style.right = "16px";
  closeBtn.onclick = () => overlay.remove();

  const titleEl = document.createElement("h2");
  titleEl.textContent = `[${post.typeLabel}] ${post.title || "未命名"}`;
  titleEl.style.margin = "0 0 6px 0";
  titleEl.style.fontSize = "18px";

  const createdAtStr = formatDate(post.createdAt);
  const metaEl = document.createElement("p");
  metaEl.className = "job-meta";
  metaEl.style.margin = "0 0 8px 0";
  metaEl.style.fontSize = "12px";
  metaEl.style.color = "#6b7280";
  metaEl.textContent = createdAtStr ? `发布于：${createdAtStr}` : "";

  const infoEl = document.createElement("div");
  infoEl.style.fontSize = "14px";
  infoEl.style.color = "#374151";
  infoEl.style.lineHeight = "1.6";

  if (post.company) {
    const p = document.createElement("p");
    p.innerHTML = `<strong>公司：</strong>${post.company}`;
    infoEl.appendChild(p);
  }
  if (post.contact) {
    const p = document.createElement("p");
    p.innerHTML = `<strong>联系方式：</strong>${post.contact}`;
    infoEl.appendChild(p);
  }
  if (post.content) {
    const p = document.createElement("p");
    p.style.marginTop = "8px";
    p.textContent = post.content;
    infoEl.appendChild(p);
  }

  // 图片区域
  const imagesWrapper = document.createElement("div");
  imagesWrapper.style.marginTop = "12px";
  imagesWrapper.style.display = "grid";
  imagesWrapper.style.gridTemplateColumns = "minmax(0,1fr)";
  imagesWrapper.style.gap = "10px";

  if (Array.isArray(post.images) && post.images.length > 0) {
    post.images.forEach((src) => {
      const img = document.createElement("img");
      img.src = src;
      img.alt = "图片";
      img.style.width = "100%";
      img.style.borderRadius = "10px";
      img.style.objectFit = "cover";
      img.loading = "lazy";
      imagesWrapper.appendChild(img);
    });
  }

  card.appendChild(closeBtn);
  card.appendChild(titleEl);
  card.appendChild(metaEl);
  card.appendChild(infoEl);
  if (imagesWrapper.childElementCount > 0) {
    card.appendChild(imagesWrapper);
  }

  overlay.appendChild(card);

  // 点击遮罩关闭（点卡片本身不关闭）
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

/* ---------------- 删除帖子（修复“假删除”） ---------------- */

async function deletePost(post) {
  if (!supabase) {
    alert("系统错误：未找到 supabaseClient。");
    return;
  }
  if (!currentUser) {
    alert("当前用户信息丢失，请刷新页面后重试。");
    return;
  }

  const ok = confirm("确认删除这条信息吗？删除后不可恢复。");
  if (!ok) return;

  const tableCfg = TABLES[post.typeKey];
  if (!tableCfg) {
    alert("未知的帖子类型，无法删除。");
    return;
  }

  try {
    // 按 id + user_id 双重条件删除，配合 Supabase RLS
    const { data, error } = await supabase
      .from(tableCfg.name)
      .delete()
      .eq("id", post.id)
      .eq("user_id", currentUser.id)
      .select();

    if (error) {
      console.error("删除失败：", error);
      alert("删除失败：请稍后重试，或检查 Supabase 的删除权限策略。");
      return;
    }

    if (!data || data.length === 0) {
      alert("删除失败：可能没有权限删除这条记录。");
      return;
    }

    // 从内存里移除并重新渲染
    myPosts = myPosts.filter(
      (p) => !(p.id === post.id && p.typeKey === post.typeKey)
    );
    renderMyPosts();
  } catch (err) {
    console.error("删除异常：", err);
    alert("删除时发生异常，请稍后重试。");
  }
}

/* ---------------- 渲染列表 ---------------- */

function renderMyPosts() {
  const listEl = document.getElementById("myJobsList");
  const statusEl = document.getElementById("myJobsStatus");

  if (!listEl || !statusEl) return;

  listEl.innerHTML = "";

  if (!currentUser) {
    statusEl.textContent = "未检测到用户登录信息，请刷新页面重试。";
    return;
  }

  if (!myPosts || myPosts.length === 0) {
    statusEl.textContent = "你在招聘、求职、租房、论坛中还没有发布任何信息。";
    return;
  }

  statusEl.textContent = `你共发布了 ${myPosts.length} 条信息。`;

  myPosts.forEach((post) => {
    const div = document.createElement("div");
    div.className = "job-item";
    div.style.cursor = "pointer"; // 整条可点

    const createdAtStr = formatDate(post.createdAt);

    let imagesThumbHtml = "";
    if (Array.isArray(post.images) && post.images.length > 0) {
      // 只显示一张缩略图
      imagesThumbHtml = `
        <div style="margin-top:8px;">
          <img src="${post.images[0]}" alt="图片预览"
               style="width:100px;height:100px;object-fit:cover;border-radius:10px;border:1px solid #d1e5d4;" />
          ${
            post.images.length > 1
              ? `<span style="font-size:12px;color:#6b7280;margin-left:6px;">+${post.images.length - 1} 张</span>`
              : ""
          }
        </div>
      `;
    }

    // 内容只截取一部分作为摘要
    let summary = post.content || "";
    if (summary.length > 80) {
      summary = summary.slice(0, 80) + "…";
    }

    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
        <div style="flex:1;">
          <h3 style="margin:0 0 4px 0;font-size:16px;">
            [${post.typeLabel}] ${post.title || "未命名"}
          </h3>
          ${post.company ? `<p style="margin:0 0 2px 0;"><strong>公司：</strong>${post.company}</p>` : ""}
          ${post.contact ? `<p style="margin:0 0 2px 0;"><strong>联系方式：</strong>${post.contact}</p>` : ""}
          ${summary ? `<p style="margin:4px 0 0 0;color:#4b5563;font-size:14px;">${summary}</p>` : ""}
          ${
            createdAtStr
              ? `<p style="margin:6px 0 0 0;font-size:12px;color:#9ca3af;">发布于：${createdAtStr}</p>`
              : ""
          }
          ${imagesThumbHtml}
        </div>
        <div class="job-actions" style="margin-left:8px;">
          <button class="delete-btn"
                  style="border:none;border-radius:999px;padding:6px 12px;font-size:13px;
                         background:#fecaca;color:#b91c1c;cursor:pointer;">
            删除
          </button>
        </div>
      </div>
    `;

    // 点击整条卡片 → 查看详情（但点击“删除”按钮除外）
    div.addEventListener("click", (e) => {
      if (e.target.closest(".delete-btn")) return;
      showPostDetail(post);
    });

    // 删除按钮
    const delBtn = div.querySelector(".delete-btn");
    if (delBtn) {
      delBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deletePost(post);
      });
    }

    listEl.appendChild(div);
  });
}

/* ---------------- 加载“我的帖子” ---------------- */

async function loadMyPosts() {
  if (!supabase) {
    console.error("supabaseClient 未初始化。");
    return;
  }
  if (!currentUser) return;

  const uid = currentUser.id;

  const queries = Object.entries(TABLES).map(([key, info]) =>
    supabase
      .from(info.name)
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          console.error(`加载 ${info.name} 失败:`, error);
          return [];
        }
        if (!data) return [];
        return data.map((row) => ({
          id: row.id,
          typeKey: key,
          typeLabel: info.label,
          table: info.name,
          title: row.title || "",
          company: row.company || "",
          contact: row.contact || "",
          content: row.content || "",
          images: Array.isArray(row.images) ? row.images : [],
          createdAt: row.created_at,
        }));
      })
  );

  const results = await Promise.all(queries);
  // 合并并按时间倒序
  myPosts = results
    .flat()
    .sort((a, b) => {
      const t1 = new Date(a.createdAt || 0).getTime();
      const t2 = new Date(b.createdAt || 0).getTime();
      return t2 - t1;
    });

  renderMyPosts();
}

/* ---------------- 初始化页面（带昵称） ---------------- */

async function initMyPage() {
  const userInfoEl = document.getElementById("userInfo");
  const logoutBtn = document.getElementById("logoutBtn");
  const nicknameInput = document.getElementById("nicknameInput");
  const saveNicknameBtn = document.getElementById("saveNicknameBtn");
  const nicknameStatusEl = document.getElementById("nicknameStatus");

  if (!supabase) {
    alert("系统错误：未找到 supabaseClient。");
    if (userInfoEl) {
      userInfoEl.textContent = "系统错误：登录模块未初始化。";
    }
    return;
  }

  try {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) {
      alert("请先登录后再访问“我的”页面。");
      window.location.href = "login.html";
      return;
    }

    currentUser = data.user;

    // 一个小函数：根据当前邮箱 + 昵称，刷新顶部文字
    const applyUserInfo = () => {
      const nick = (localStorage.getItem("dlh_nickname") || "").trim();
      if (userInfoEl) {
        userInfoEl.textContent =
          `当前登录：${currentUser.email}` + (nick ? `（昵称：${nick}）` : "");
      }
    };

    // 初始化昵称输入框
    const savedNickname = (localStorage.getItem("dlh_nickname") || "").trim();
    if (nicknameInput) {
      nicknameInput.value = savedNickname;
    }
    applyUserInfo();

    // 保存昵称按钮
    if (saveNicknameBtn) {
      saveNicknameBtn.addEventListener("click", () => {
        const value = (nicknameInput?.value || "").trim();
        if (!value) {
          localStorage.removeItem("dlh_nickname");
          if (nicknameStatusEl) {
            nicknameStatusEl.textContent = "已清空昵称，将继续使用邮箱显示。";
          }
        } else {
          localStorage.setItem("dlh_nickname", value);
          if (nicknameStatusEl) {
            nicknameStatusEl.textContent = "昵称已保存，在评论区将显示这个名字。";
          }
        }
        applyUserInfo();
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener("click", async () => {
        await supabase.auth.signOut();
        window.location.href = "index.html";
      });
    }

    await loadMyPosts();
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
