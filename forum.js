// forum.js
const supabase = window.supabaseClient;

const form = document.getElementById("postForm");
const statusEl = document.getElementById("status");
const listEl = document.getElementById("postList");

// 加载帖子
async function loadForum() {
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

// 发帖
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) {
    alert("请先登录！");
    window.location.href = "login.html";
    return;
  }

  const title = document.getElementById("title").value.trim();
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

  statusEl.textContent = "发布成功！";
  statusEl.style.color = "green";
  form.reset();
  loadForum();
});
