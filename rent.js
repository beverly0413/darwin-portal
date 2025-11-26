// rent.js —— 使用 Supabase 云端数据库版本
// 表名：rent_posts

const supabase = window.supabaseClient; 
const MAX_IMAGES = 5;

let rentImagesList = []; // File 对象数组

// File[] -> base64[]
function filesToBase64(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.readAsDataURL(file);
        })
    )
  );
}

// 渲染租房列表
async function loadRents() {
  const listEl = document.getElementById("rentList");
  if (!listEl) return;

  listEl.innerHTML = "加载中...";

  const { data, error } = await supabase
    .from("rent_posts")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("加载错误：", error);
    listEl.innerHTML = "加载失败，请稍候再试。";
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<p style="color:#6b7280;font-size:13px;">目前还没有租房信息。</p>';
    return;
  }

  listEl.innerHTML = "";

  data.forEach((rent) => {
    const div = document.createElement("div");
    div.className = "post";

    const date = new Date(rent.created_at);
    const dateStr = `${date.getFullYear()}-${String(
      date.getMonth() + 1
    ).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

    let imagesHtml = "";
    if (Array.isArray(rent.images) && rent.images.length > 0) {
      imagesHtml = `
        <div class="rent-photos">
          ${rent.images
            .map((img) => `<img src="${img}" alt="房源图片" />`)
            .join("")}
        </div>`;
    }

    div.innerHTML = `
      <h3>${rent.title}</h3>
      <p><strong>联系方式：</strong>${rent.contact}</p>
      <p style="white-space:pre-wrap;">${rent.content}</p>
      ${imagesHtml}
      <small style="color:#6b7280;">发布于：${dateStr}</small>
    `;

    listEl.appendChild(div);
  });
}

// 图片预览
function updateRentPreview() {
  const previewEl = document.getElementById("rentPreview");
  previewEl.innerHTML = "";

  rentImagesList.forEach((file, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "preview-item";

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
    btn.className = "preview-remove";
    btn.onclick = () => {
      rentImagesList.splice(idx, 1);
      updateRentPreview();
    };

    wrap.appendChild(img);
    wrap.appendChild(btn);
    previewEl.appendChild(wrap);
  });
}

// 初始化表单
function setupRentForm() {
  const form = document.getElementById("rentForm");
  const statusEl = document.getElementById("rentStatus");
  const input = document.getElementById("rentImages");
  const clearBtn = document.getElementById("rentClearImages");

  // 添加图片
  input.addEventListener("change", (e) => {
    const newFiles = Array.from(e.target.files || []);
    for (const file of newFiles) {
      if (rentImagesList.length >= MAX_IMAGES) break;
      rentImagesList.push(file);
    }
    input.value = "";
    updateRentPreview();
  });

  // 清空图片
  clearBtn.addEventListener("click", () => {
    rentImagesList = [];
    updateRentPreview();
  });

  // 提交表单（发帖）
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

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

    // 检查登录
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData?.user) {
      alert("请先登录再发布。");
      window.location.href = "login.html";
      return;
    }
    const user = userData.user;

    // 转换图片
    const imagesBase64 = await filesToBase64(
      rentImagesList.slice(0, MAX_IMAGES)
    );

    // 写入 Supabase
    const { error } = await supabase.from("rent_posts").insert({
      title,
      contact,
      content,
      images: imagesBase64,
      user_id: user.id,
      user_email: user.email,
    });

    if (error) {
      console.error("发帖失败：", error);
      statusEl.textContent = "发布失败，请稍后再试。";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "发布成功！";
    statusEl.style.color = "green";

    form.reset();
    rentImagesList = [];
    updateRentPreview();

    loadRents(); // 重新加载
  });
}

// 页面初始化
document.addEventListener("DOMContentLoaded", () => {
  loadRents();
  setupRentForm();
});
