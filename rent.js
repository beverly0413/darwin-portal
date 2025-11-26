// rent.js —— 使用 Supabase 数据库存储租房信息
// 表名：rent_posts

const MAX_IMAGES = 5;
let rentImagesList = []; // 当前准备上传的图片 File 列表

// 工具：File[] -> base64[]
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

// 工具：检查 supabaseClient 是否存在
function ensureSupabase() {
  if (!window.supabaseClient) {
    console.error("supabaseClient 未初始化，请检查公共 supabase 配置脚本。");
    alert("系统配置错误：未找到 supabaseClient。");
    return false;
  }
  return true;
}

/* ===================== 列表加载 ===================== */

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
    listEl.textContent = "加载失败，请稍后重试。";
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
    div.className = "post";

    const createdAt = rent.created_at ? new Date(rent.created_at) : new Date();
    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

    let imagesHtml = "";
    if (Array.isArray(rent.images) && rent.images.length > 0) {
      imagesHtml = `
        <div class="rent-photos">
          ${rent.images
            .map((img) => `<img src="${img}" alt="房源图片" />`)
            .join("")}
        </div>
      `;
    }

    div.innerHTML = `
      <h3>${rent.title || "未命名房源"}</h3>
      <p><strong>联系方式：</strong>${rent.contact || "未填写"}</p>
      ${
        rent.content
          ? `<p style="white-space:pre-wrap;">${rent.content}</p>`
          : ""
      }
      ${imagesHtml}
      <small style="color:#6b7280;">发布于：${dateStr}</small>
    `;

    listEl.appendChild(div);
  });
}

/* ===================== 图片预览 ===================== */

function updateRentPreview() {
  const previewEl = document.getElementById("rentPreview");
  if (!previewEl) return;

  previewEl.innerHTML = "";

  rentImagesList.forEach((file, idx) => {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";

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
    btn.addEventListener("click", () => {
      rentImagesList.splice(idx, 1);
      updateRentPreview();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(btn);
    previewEl.appendChild(wrapper);
  });
}

/* ===================== 表单逻辑 ===================== */

function setupRentForm() {
  const form = document.getElementById("rentForm");
  const statusEl = document.getElementById("rentStatus");
  const input = document.getElementById("rentImages");
  const clearBtn = document.getElementById("rentClearImages");

  if (!form || !statusEl) return;

  // 选择图片（多次选择累加，最多 5 张）
  if (input) {
    input.addEventListener("change", (e) => {
      const files = Array.from(e.target.files || []);
      for (const file of files) {
        if (rentImagesList.length >= MAX_IMAGES) break;
        rentImagesList.push(file);
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

    // 1. 检查登录
    const { data: userData, error: userErr } = await supabaseClient
      .auth
      .getUser();

    if (userErr || !userData?.user) {
      alert("请先登录后再发布房源信息。");
      window.location.href = "login.html";
      return;
    }
    const user = userData.user;

    // 2. 处理图片为 base64 数组
    let imagesBase64 = [];
    try {
      imagesBase64 = await filesToBase64(
        rentImagesList.slice(0, MAX_IMAGES)
      );
    } catch (err) {
      console.error("读取图片失败：", err);
      statusEl.textContent = "读取图片失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    // 3. 写入 Supabase
    const payload = {
      title,
      contact,
      images: imagesBase64,
      user_id: user.id,
      user_email: user.email,
    };

    // 如果你在表里加了 content 字段，就保留这一行；否则可以删掉
    payload.content = content;

    const { error } = await supabaseClient
      .from("rent_posts")
      .insert(payload);

    if (error) {
      console.error("发布失败：", error);
      statusEl.textContent = "发布失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "发布成功！";
    statusEl.style.color = "green";

    // 4. 重置表单 & 预览 & 列表
    form.reset();
    rentImagesList = [];
    updateRentPreview();
    loadRents();
  });
}

/* ===================== 初始化 ===================== */

document.addEventListener("DOMContentLoaded", () => {
  loadRents();
  setupRentForm();
});
