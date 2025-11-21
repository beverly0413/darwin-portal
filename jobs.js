// jobs.js
const supabase = window.supabaseClient;

const jobList = document.getElementById("jobList");
const form = document.getElementById("jobForm");
const statusEl = document.getElementById("jobStatus");

// 加载招聘列表
async function loadJobs() {
  const { data, error } = await supabase
    .from("posts")
    .select("*")
    .eq("category", "jobs")
    .order("id", { ascending: false }); // 用 id 排序，避免 order=created_at.desc 的老请求

  if (error) {
    console.error(error);
    jobList.innerHTML = "加载失败：" + error.message;
    return;
  }

  jobList.innerHTML = "";

  data.forEach((job) => {
    const div = document.createElement("div");
    div.className = "post";
    div.innerHTML = `
      <h3>${job.title || "未命名职位"}</h3>
      <p><strong>联系方式：</strong>${job.contact || "未填写"}</p>
      <p>${(job.content || "").replace(/\n/g, "<br>")}</p>
    `;
    jobList.appendChild(div);
  });
}

loadJobs();

// 发布招聘
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  if (!user) {
    alert("请先登录！");
    window.location.href = "login.html";
    return;
  }

  const title = document.getElementById("jobTitle").value.trim();
  const contact = document.getElementById("jobContact").value.trim();
  const content = document.getElementById("jobContent").value.trim();

  if (!title || !contact) {
    statusEl.textContent = "职位名称和联系方式是必填的。";
    statusEl.style.color = "red";
    return;
  }

  const { error } = await supabase.from("posts").insert({
    user_id: user.id,
    category: "jobs",
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

  statusEl.textContent = "发布成功！";
  statusEl.style.color = "green";
  form.reset();
  loadJobs();
});
