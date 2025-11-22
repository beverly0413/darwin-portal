// forum.js
const supabase = window.supabaseClient;

const listEl  = document.getElementById("posts");      // 帖子列表容器
const form    = document.getElementById("forumForm");  // 发帖表单

// 状态提示，没有就自动创建一个
let statusEl = document.getElementById("forumStatus");
if (form && !statusEl) {
  statusEl = document.createElement("div");
  statusEl.id = "forumStatus";
  statusEl.style.fontSize = "13px";
  statusEl.style.marginTop = "6px";
  form.appendChild(statusEl);
}

// 加载论坛帖子
async function loadForum() {
  if (!listEl) return;

  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("category", "forum")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    listEl.innerHTML = "加载失败：" + error.message;
    return;
  }

  listEl.innerHTML = "";

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<div class="posts-empty">暂时还没有帖子，欢迎先发一条 🙂</div>';
    return;
  }

  data.forEach((p) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <h3>${p.title || "无标题"}</h3>
      <p>${(p.content || "").replace(/\n/g, "<br>")}</p>
    `;
    listEl.appendChild(div);
  });
}

loadForum();

// 发布帖子
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;

    if (!user) {
      alert("请先登录！");
      window.location.href = "login.html";
      return;
    }

    const title   = document.getElementById("title").value.trim();
    const content = document.getElementById("content").value.trim();

    if (!title) {
      statusEl.textContent = "标题是必填的。";
      statusEl.style.color = "red";
      return;
    }

    const { error } = await supabase.from("posts").insert({
      user_id: user.id,
      category: "forum",
      title,
      content,
    });

    if (error) {
      console.error(error);
      statusEl.textContent = "发布失败：" + error.message;
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "已发布！";
    statusEl.style.color = "green";
    form.reset();
    loadForum();
  });
}
