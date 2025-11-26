// rent.js
// 所有人都能看列表；只有发布时才检查是否登录（逻辑和 jobs.js 一样）

const RENT_STORAGE_KEY = "darwin_life_hub_rent_v1";

const MAX_IMAGES = 5;
let rentImagesList = [];
let rentsMemory = [];

/* ========== 本地存储 ========== */

// 从 localStorage 读出所有租房信息
function loadRentsFromStorage() {
  try {
    const raw = localStorage.getItem(RENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("读取本地租房信息失败:", e);
    return [];
  }
}

// 保存到 localStorage
function saveRentsToStorage() {
  try {
    localStorage.setItem(RENT_STORAGE_KEY, JSON.stringify(rentsMemory));
  } catch (e) {
    console.error("保存本地租房信息失败:", e);
  }
}

/* ========== 渲染列表 ========== */

function renderRents() {
  const listEl = document.getElementById("rentList");
  listEl.innerHTML = "";

  if (!rentsMemory || rentsMemory.length === 0) {
    listEl.innerHTML =
      '<p style="color:#6b7280;font-size:13px;">目前还没有房源信息，欢迎发布第一条。</p>';
    return;
  }

  // 按时间倒序显示（最新在上）
  const sorted = [...rentsMemory].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  sorted.forEach((rent) => {
    const div = document.createElement("div");
    div.className = "post";
    div.style.marginBottom = "16px";

    const date = new Date(rent.createdAt);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}-${String(date.getDate()).padStart(2, "0")}`;

    // 图片
    let imagesHtml = "";
    if (rent.images && rent.images.length > 0) {
      imagesHtml = `
        <div class="rent-photos">
          ${rent.images
            .map(
              (src) =>
                `<img src="${src}" alt="房源图片" loading="lazy" />`
            )
            .join("")}
        </div>
      `;
    }

    div.innerHTML = `
      <h3>${rent.title || "未命名房源"}</h3>
      <p><strong>联系方式：</strong>${rent.contact || "未填写"}</p>
      <p style="white-space:pre-wrap;">${rent.content || ""}</p>
      ${imagesHtml}
      <small style="display:block;margin-top:4px;color:#9ca3af;font-size:12px;">
        发布于：${dateStr}
      </small>
    `;

    listEl.appendChild(div);
  });
}

/* ========== 图片预览（和 jobs 一样的思路） ========== */

function updateRentPreview() {
  const previewEl = document.getElementById("rentPreview");
  previewEl.innerHTML = "";

  rentImagesList.forEach((file, index) => {
    const wrap = document.createElement("div");
    wrap.className = "preview-item";

    const img = document.createElement("img");
    const reader = new FileReader();

    reader.onload = (e) => (img.src = e.target.result);
    reader.readAsDataURL(file);

    img.style.width = "90px";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "8px";
    img.style.border = "1px solid #d1e5d4";

    const btn = document.createElement("button");
    btn.textContent = "×";
    btn.type = "button";
    btn.className = "preview-remove";
    btn.addEventListener("click", () => {
      rentImagesList.splice(index, 1);
      updateRentPreview();
    });

    wrap.appendChild(img);
    wrap.appendChild(btn);
    previewEl.appendChild(wrap);
  });
}

/* ========== 表单逻辑 ========== */

function setupRentForm() {
  const form = document.getElementById("rentForm");
  const statusEl = document.getElementById("rentStatus");
  const filesInput = document.getElementById("rentImages");
  const clearBtn = document.getElementById("rentClearImages");

  // 选择图片（累加，最多 5 张）
  if (filesInput) {
    filesInput.addEventListener("change", (e) => {
      const newFiles = Array.from(e.target.files || []);
      for (const file of newFiles) {
        if (rentImagesList.length >= MAX_IMAGES) break;
        rentImagesList.push(file);
      }
      filesInput.value = "";
      updateRentPreview();
    });
  }

  // 清空图片
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      rentImagesList = [];
      if (filesInput) filesInput.value = "";
      updateRentPreview();
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    statusEl.textContent = "";
    statusEl.style.color = "#6b7280";

    const title = document.getElementById("rentTitle").value.trim();
    const contact = document.getElementById("rentContact").value.trim();
    const content = document.getElementById("rentContent").value.trim();

    if (!title || !contact) {
      statusEl.textContent = "房源标题和联系方式是必填项";
      statusEl.style.color = "red";
      return;
    }

    // 发帖前检查登录状态，并获取 user
    let user;
    try {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data?.user) {
        alert("请先登录后再发布房源信息。");
        window.location.href = "login.html";
        return;
      }
      user = data.user;
    } catch (err) {
      console.error("检查登录状态失败:", err);
      alert("登录状态异常，请重新登录。");
      window.location.href = "login.html";
      return;
    }

    // 处理图片为 base64 存在本地
    statusEl.textContent = "正在保存...";
    statusEl.style.color = "#6b7280";

    const files = rentImagesList.slice(0, MAX_IMAGES);

    const imagesBase64 = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => resolve(e.target.result);
            reader.readAsDataURL(file);
          })
      )
    );

    const newRent = {
      id: Date.now(),
      title,
      contact,
      content,
      images: imagesBase64,
      createdAt: new Date().toISOString(),
      // ★ 新增：记录发帖人
      userId: user.id,
      userEmail: user.email,
    };

    rentsMemory.push(newRent);
    saveRentsToStorage();
    renderRents();

    form.reset();
    rentImagesList = [];
    updateRentPreview();

    statusEl.textContent = "发布成功";
    statusEl.style.color = "green";
  });
}

/* ========== 初始化：不要求登录，只读本地数据 ========== */

document.addEventListener("DOMContentLoaded", () => {
  rentsMemory = loadRentsFromStorage();
  renderRents();
  setupRentForm();
});
