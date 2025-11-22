// rent.js
const supabase = window.supabaseClient;

const rentList = document.getElementById("rentList");
const form = document.getElementById("rentForm");
const statusEl = document.getElementById("rentStatus");

// ================== 加载房源列表 ==================
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

    // 解析图片链接（image_urls 用 "||" 拼接）
    const images = (r.image_urls || "")
      .split("||")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const imagesHtml = images.length
      ? `
        <div class="rent-photos">
          ${images
            .map(
              (url) => `<img src="${url}" alt="房源图片" loading="lazy" />`
            )
            .join("")}
        </div>
      `
      : "";

    div.innerHTML = `
      <h3>${r.title || "未命名房源"}</h3>
      <p><strong>联系方式：</strong>${r.contact || "未填写"}</p>
      <p>${(r.content || "").replace(/\n/g, "<br>")}</p>
      ${imagesHtml}
    `;
    rentList.appendChild(div);
  });
}

loadRents();

// ================== 工具函数：上传单个文件到 Storage ==================
async function uploadImageToStorage(file, userId, index) {
  // 简单取扩展名
  const parts = file.name.split(".");
  const ext = parts.length > 1 ? parts.pop() : "jpg";

  // 路径：userId/时间戳_序号.扩展名
  const path = `${userId}/${Date.now()}_${index}.${ext}`;

  const { data, error } = await supabase.storage
    .from("rent-images") // 你指定的 bucket 名
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("图片上传失败：", error);
    throw error;
  }

  const { data: urlData } = supabase.storage
    .from("rent-images")
    .getPublicUrl(data.path);

  return urlData.publicUrl;
}

// ================== 发布房源 ==================
form.addEventListener("submit", async (e) => {
  e.preventDefault();

  statusEl.textContent = "";
  statusEl.style.color = "#6b7280";

  // 获取登录用户
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    console.error(userErr);
    alert("获取登录状态失败，请重新登录。");
    window.location.href = "login.html";
    return;
  }

  const user = userData?.user;

  if (!user) {
    alert("请先登录！");
    window.location.href = "login.html";
    return;
  }

  const title = document.getElementById("rentTitle").value.trim();
  const contact = document.getElementById("rentContact").value.trim();
  const content = document.getElementById("rentContent").value.trim();
  const filesInput = document.getElementById("rentImages");
  const files = filesInput?.files || [];

  if (!title || !contact) {
    statusEl.textContent = "房源标题和联系方式是必填的。";
    statusEl.style.color = "red";
    return;
  }

  if (files.length > 5) {
    statusEl.textContent = "最多只能上传 5 张照片。";
    statusEl.style.color = "red";
    return;
  }

  statusEl.textContent = "正在上传图片并发布，请稍等...";
  statusEl.style.color = "#6b7280";

  let imageUrls = [];

  try {
    if (files.length > 0) {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const url = await uploadImageToStorage(file, user.id, i);
        imageUrls.push(url);
      }
    }
  } catch (err) {
    console.error(err);
    statusEl.textContent = "图片上传失败，请稍后重试。";
    statusEl.style.color = "red";
    return;
  }

  const image_urls = imageUrls.length ? imageUrls.join("||") : null;

  const { error } = await supabase.from("posts").insert({
    user_id: user.id,
    category: "rent",
    title,
    contact,
    content,
    image_urls, // 新增字段
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
