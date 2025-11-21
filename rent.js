// rent.js
const supabase = window.supabaseClient;

const rentList = document.getElementById("rentList");
const form = document.getElementById("rentForm");
const statusEl = document.getElementById("rentStatus");

// 加载房源列表
async function loadRents() {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("category", "rent")
    .order("id", { ascending: false });

  if (error) {
    console.error(error);
    rentList.innerHTML = "加载失败：" + error.message;
    return;
  }

  rentList.innerHTML = "";

  data.forEach((r) => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <h3>${r.title || "未命名房源"}</h3>
      <p><strong>联系方式：</strong>${r.contact || "未填写"}</p>
      <p>${(r.content || "").replace(/\n/g, "<br>")}</p>
    `;
    rentList.appendChild(div);
  });
}

loadRents();

// 发布房源
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) {
    alert("请先登录！");
    window.location.href = "login.html";
    return;
  }

  const title = document.getElementById("rentTitle").value.trim();
  const contact = document.getElementById("rentContact").value.trim();
  const content = document.getElementById("rentContent").value.trim();

  if (!title || !contact) {
    statusEl.textContent = "房源标题和联系方式是必填的。";
    statusEl.style.color = "red";
    return;
  }

  const { error } = await supabase.from("posts").insert({
    user_id: user.id,
    category: "rent",
    title,
    contact,
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
  loadRents();
});
