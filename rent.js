// rent.js
// 租房页面：任何人可以看帖，发布时必须登录（依赖 auth-guard.js 的 requireLogin）

// 页面元素
const rentList = document.getElementById("rentList");
const form = document.getElementById("rentForm");
const statusEl = document.getElementById("rentStatus");

const filesInput = document.getElementById("rentImages");
const rentPreview = document.getElementById("rentPreview");
const clearBtn = document.getElementById("rentClearImages");

let rentImagesList = [];
const MAX_IMAGES = 5;

// 方便取 supabase 客户端（由 supabase.js 创建 window.supabaseClient）
function getSupabase() {
  const client = window.supabaseClient;
  if (!client) {
    console.error("Supabase 客户端未初始化，请检查 supabase.js 引入顺序。");
  }
  return client;
}

/* ================= 预览相关 ================= */

// 刷新本地预览（支持单张删除）
function updateRentPreview() {
  if (!rentPreview) return;
  rentPreview.innerHTML = "";

  rentImagesList.forEach((file, index) => {
    const wrapper = document.createElement("div");
    wrapper.className = "preview-item";

    const img = document.createElement("img");
    img.alt = file.name;
    img.style.width = "90px";
    img.style.height = "90px";
    img.style.objectFit = "cover";
    img.style.borderRadius = "8px";
    img.style.border = "1px solid #d1e5d4";

    const reader = new FileReader();
    reader.onload = (ev) => {
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "×";
    removeBtn.className = "preview-remove";
    removeBtn.addEventListener("click", () => {
      rentImagesList.splice(index, 1);
      updateRentPreview();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    rentPreview.appendChild(wrapper);
  });
}

// 监听选择文件（累加到数组，最多 5 张）
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

// 清空所有图片
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    rentImagesList = [];
    if (filesInput) filesInput.value = "";
    updateRentPreview();
  });
}

/* ============= 图片格式处理：自动转为 JPEG ============= */

async function convertImageToJpeg(file) {
  const safeTypes = ["image/jpeg", "image/png", "image/webp"];

  // 常见格式直接用
  if (safeTypes.includes(file.type)) {
    return file;
  }

  // 其他格式（HEIC 等）转成 JPEG
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("图片转换失败：canvas.toBlob 返回空值"));
                return;
              }
              const newName = file.name.replace(/\.\w+$/i, "") + ".jpg";
              const jpegFile = new File([blob], newName, { type: "image/jpeg" });
              resolve(jpegFile);
            },
            "image/jpeg",
            0.9
          );
        } catch (err) {
          reject(err);
        }
      };

      img.onerror = (err) => reject(err);
      img.src = e.target.result;
    };

    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

// 上传单张图片到 Supabase Storage，返回 public URL
async function uploadImageToStorage(file, userId, index) {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase 未初始化");

  const fileToUpload = await convertImageToJpeg(file);
  const ext = "jpg";
  const path = `${userId}/${Date.now()}_${index}.${ext}`;

  const { data, error } = await supabase.storage
    .from("rent-images")
    .upload(path, fileToUpload, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("上传图片失败：", error);
    throw error;
  }

  const { data: publicUrlData } = supabase.storage
    .from("rent-images")
    .getPublicUrl(data.path);

  return publicUrlData.publicUrl;
}

/* ================= 加载房源列表（所有人可见） ================= */

async function loadRents() {
  const supabase = getSupabase();
  if (!supabase) {
    rentList.innerHTML = "系统未正确初始化 Supabase，无法加载房源。";
    return;
  }

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

  if (!data || data.length === 0) {
    rentList.innerHTML =
      '<p style="color:#6b7280;font-size:13px;">目前还没有房源信息，欢迎成为第一个发布的人。</p>';
    return;
  }

  data.forEach((r) => {
    const div = document.createElement("div");
    div.className = "post";
    div.style.marginBottom = "16px";

    const images = (r.image_urls || "")
      .split("||")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const imagesHtml = images.length
      ? `
        <div class="rent-photos">
          ${images
            .map(
              (url) =>
                `<img src="${url}" alt="房源图片" loading="lazy" />`
            )
            .join("")}
        </div>
      `
      : "";

    // 格式化发布时间
    let createdLine = "";
    if (r.created_at) {
      const d = new Date(r.created_at);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getDate()).padStart(2, "0")}`;
      createdLine = `<small style="display:block;margin-top:4px;color:#9ca3af;font-size:12px;">发布于：${dateStr}</small>`;
    }

    div.innerHTML = `
      <h3>${r.title || "未命名房源"}</h3>
      <p><strong>联系方式：</strong>${r.contact || "未填写"}</p>
      <p style="white-space:pre-wrap;">${r.content || ""}</p>
      ${imagesHtml}
      ${createdLine}
    `;

    rentList.appendChild(div);
  });
}

/* ================== 提交表单：发布房源（必须登录） ================== */

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  statusEl.textContent = "";
  statusEl.style.color = "#6b7280";

  // 1）发帖前检查登录：使用 auth-guard.js 里的 requireLogin()
  let user;
  try {
    user = await requireLogin();  // 未登录会弹窗 + 跳 login.html + 抛异常:contentReference[oaicite:1]{index=1}
  } catch (err) {
    // 未登录的情况，这里直接结束，不再继续发帖
    console.warn("未登录用户尝试发布房源：", err);
    return;
  }

  const title = document.getElementById("rentTitle").value.trim();
  const contact = document.getElementById("rentContact").value.trim();
  const content = document.getElementById("rentContent").value.trim();

  const files =
    rentImagesList.length > 0 ? rentImagesList : (filesInput?.files || []);

  if (!title || !contact) {
    statusEl.textContent = "房源标题和联系方式是必填的。";
    statusEl.style.color = "red";
    return;
  }

  if (files.length > MAX_IMAGES) {
    statusEl.textContent = "最多只能上传 5 张照片。";
    statusEl.style.color = "red";
    return;
  }

  statusEl.textContent = "正在上传图片并发布，请稍等...";
  statusEl.style.color = "#6b7280";

  const supabase = getSupabase();
  if (!supabase) {
    statusEl.textContent = "系统未初始化 Supabase，无法发布。";
    statusEl.style.color = "red";
    return;
  }

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
    image_urls,
    // created_at 使用表里的默认时间
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

  rentImagesList = [];
  if (filesInput) filesInput.value = "";
  updateRentPreview();

  loadRents();
});

/* ================== 初始化：任何人都能看房源 ================== */

document.addEventListener("DOMContentLoaded", () => {
  loadRents();
});
