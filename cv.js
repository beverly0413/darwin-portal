// cv.js —— 使用 Supabase 存储求职信息
// 表名：cv_posts

const CV_MAX_IMAGES = 5;
let cvImagesList = [];

// 检查 supabaseClient
function ensureSupabase() {
  if (!window.supabaseClient) {
    console.error("supabaseClient 未初始化，请检查公共配置脚本。");
    alert("系统配置错误：未找到 supabaseClient。");
    return false;
  }
  return true;
}

// File[] -> base64[]
function cvFilesToBase64(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
}

// 图片预览
function updateCvPreview() {
  const previewEl = document.getElementById("cvPreview");
  if (!previewEl) return;

  previewEl.innerHTML = "";

  cvImagesList.forEach((file, index) => {
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

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.className = "preview-remove";
    removeBtn.addEventListener("click", () => {
      cvImagesList.splice(index, 1);
      updateCvPreview();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    previewEl.appendChild(wrapper);
  });
}

// 加载求职列表
async function loadCvs() {
  const listEl = document.getElementById("cvList");
  if (!listEl) return;

  listEl.innerHTML = "加载中...";

  if (!ensureSupabase()) {
    listEl.textContent = "系统配置错误，无法加载数据。";
    return;
  }

  const { data, error } = await supabaseClient
    .from("cv_posts")
    .select("id, title, contact, content, images, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("加载求职信息失败：", error);
    listEl.textContent = "加载失败，请稍后重试。";
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML =
      '<p style="font-size:13px;color:#6b7280;">目前还没有求职信息，欢迎发布第一条。</p>';
    return;
  }

  listEl.innerHTML = "";

  data.forEach((cv) => {
    const div = document.createElement("div");
    div.className = "post";

    const createdAt = cv.created_at ? new Date(cv.created_at) : new Date();
    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}-${String(createdAt.getDate()).padStart(2, "0")}`;

    let imagesHtml = "";
    if (Array.isArray(cv.images) && cv.images.length > 0) {
      imagesHtml = `
        <div class="cv-photos">
          ${cv.images
            .map((url) => `<img src="${url}" alt="求职相关图片" loading="lazy" />`)
            .join("")}
        </div>
      `;
    }

    div.innerHTML = `
      <h3>${cv.title || "匿名求职"}</h3>
      ${cv.contact ? `<p><strong>联系方式：</strong>${cv.contact}</p>` : ""}
      ${
        cv.content
          ? `<p style="white-space:pre-wrap;">${cv.content}</p>`
          : ""
      }
      ${imagesHtml}
      <small>发布于：${dateStr}</small>
    `;

    listEl.appendChild(div);
  });
}

// 表单逻辑
function setupCvForm() {
  const form = document.getElementById("cvForm");
  const statusEl = document.getElementById("cvStatus");
  const imagesInput = document.getElementById("cvImages");
  const clearBtn = document.getElementById("cvClearImages");

  if (!form || !statusEl) return;

  if (imagesInput) {
    imagesInput.addEventListener("change", (e) => {
      const newFiles = Array.from(e.target.files || []);
      for (const file of newFiles) {
        if (cvImagesList.length >= CV_MAX_IMAGES) break;
        cvImagesList.push(file);
      }
      imagesInput.value = "";
      updateCvPreview();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      cvImagesList = [];
      updateCvPreview();
      if (imagesInput) imagesInput.value = "";
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!ensureSupabase()) return;

    const titleEl = document.getElementById("cvTitle");
    const contactEl = document.getElementById("cvContact");
    const contentEl = document.getElementById("cvContent");

    const title = titleEl.value.trim();
    const contact = contactEl.value.trim();
    const content = contentEl.value.trim();

    if (!title) {
      statusEl.textContent = "职位方向 / 标题是必填项。";
      statusEl.style.color = "red";
      return;
    }
    if (!contact) {
      statusEl.textContent = "联系方式是必填项。";
      statusEl.style.color = "red";
      return;
    }

    statusEl.textContent = "正在保存...";
    statusEl.style.color = "#6b7280";

    // 登录检查
    const { data: userData, error: userErr } =
      await supabaseClient.auth.getUser();
    if (userErr || !userData?.user) {
      alert("请先登录后再发布求职信息。");
      window.location.href = "login.html";
      return;
    }
    const user = userData.user;

    // 处理图片
    let imageDataUrls = [];
    try {
      if (cvImagesList.length > 0) {
        imageDataUrls = await cvFilesToBase64(
          cvImagesList.slice(0, CV_MAX_IMAGES)
        );
      }
    } catch (err) {
      console.error("读取图片失败：", err);
      statusEl.textContent = "读取图片失败，请重试。";
      statusEl.style.color = "red";
      return;
    }

    const payload = {
      title,
      contact,
      content,
      images: imageDataUrls,
      user_id: user.id,
      user_email: user.email,
    };

    const { error } = await supabaseClient.from("cv_posts").insert(payload);

    if (error) {
      console.error("发布求职失败：", error);
      statusEl.textContent = "发布失败，请稍后重试。";
      statusEl.style.color = "red";
      return;
    }

    form.reset();
    cvImagesList = [];
    updateCvPreview();

    statusEl.textContent = "求职信息已发布。";
    statusEl.style.color = "green";

    loadCvs();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadCvs();
  setupCvForm();
});
