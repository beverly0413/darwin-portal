const supabase = window.supabaseClient;

const rentList = document.getElementById("rentList");
const form = document.getElementById("rentForm");
const statusEl = document.getElementById("rentStatus");

// 文件 input + 预览 + 自己维护的文件数组
const filesInput = document.getElementById("rentImages");
const rentPreview = document.getElementById("rentPreview");
let rentImagesList = [];   // 用数组来保存已选文件
const MAX_IMAGES = 5;

// 刷新本地预览
function updateRentPreview() {
  if (!rentPreview) return;

  rentPreview.innerHTML = "";

  rentImagesList.forEach((file) => {
    const img = document.createElement("img");
    img.alt = file.name;

    const reader = new FileReader();
    reader.onload = (ev) => {
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);

    rentPreview.appendChild(img);
  });
}

// 选择文件时，累加到数组，而不是覆盖
if (filesInput) {
  filesInput.addEventListener("change", (e) => {
    const newFiles = Array.from(e.target.files || []);

    for (const file of newFiles) {
      if (rentImagesList.length >= MAX_IMAGES) break;
      rentImagesList.push(file);
    }

    // 清空当前这次的 value，避免同一文件无法再次选择
    filesInput.value = "";

    // 刷新预览
    updateRentPreview();
  });
}

// ========= 把非通用格式自动转成 JPEG =========
async function convertImageToJpeg(file) {
  // 浏览器能直接用而且最稳的格式
  const safeTypes = ["image/jpeg", "image/png", "image/webp"];

  // 如果本来就是常见格式，就不用转换，直接上传
  if (safeTypes.includes(file.type)) {
    return file;
  }

  // 万一 type 为空，但扩展名是 jpg/png/webp，也当作安全格式
  const nameLower = file.name.toLowerCase();
  if (
    nameLower.endsWith(".jpg") ||
    nameLower.endsWith(".jpeg") ||
    nameLower.endsWith(".png") ||
    nameLower.endsWith(".webp")
  ) {
    return file;
  }

  // 其他格式（比如 avif、heic 等），统一转成 jpg 再上传
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

          // 质量 0.9 的 JPEG
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                reject(new Error("图片转换失败：canvas.toBlob 返回空值"));
                return;
              }
              const newName = file.name.replace(/\.\w+$/i, "") + ".jpg";
              const jpegFile = new File([blob], newName, {
                type: "image/jpeg",
              });
              resolve(jpegFile);
            },
            "image/jpeg",
            0.9
          );
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = (err) => {
        reject(err);
      };
      img.src = e.target.result;
    };

    reader.onerror = (err) => {
      reject(err);
    };

    reader.readAsDataURL(file);
  });
}

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
  // 先把不稳定格式（avif/heic 等）转换成 jpeg
  const fileToUpload = await convertImageToJpeg(file);

  // 根据 “转换后的文件名” 来决定扩展名
  const parts = fileToUpload.name.split(".");
  const ext = parts.length > 1 ? parts.pop() : "jpg";

  // 路径：userId/时间戳_序号.扩展名
  const path = `${userId}/${Date.now()}_${index}.${ext}`;

  const { data, error } = await supabase.storage
    .from("rent-images") // 你指定的 bucket 名
    .upload(path, fileToUpload, {
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

  // 使用我们累积的文件，没有的话再退回到 input.files
  const files =
    rentImagesList.length > 0
      ? rentImagesList
      : (filesInput?.files || []);

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

  // 发布成功后清空已选图片和预览
  rentImagesList = [];
  if (filesInput) {
    filesInput.value = "";
  }
  updateRentPreview();

  loadRents();
});
