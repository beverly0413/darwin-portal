import { supabase } from "./supabase.js";

const titleEl = document.getElementById("newsTitle");
const summaryEl = document.getElementById("newsSummary");
const editorEl = document.getElementById("newsEditor");

const coverImageFilesEl = document.getElementById("coverImageFiles");
const coverPreviewEl = document.getElementById("coverPreview");

const inlineImageInput = document.getElementById("inlineImageInput");
const insertImageBtn = document.getElementById("insertImageBtn");
const insertHrBtn = document.getElementById("insertHrBtn");

const publishBtn = document.getElementById("publishBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const publishStatus = document.getElementById("publishStatus");
const editorMode = document.getElementById("editorMode");

const refreshBtn = document.getElementById("refreshBtn");
const listEl = document.getElementById("newsList");
const emptyHint = document.getElementById("emptyHint");

let editingId = null;
let savedRange = null;

// 当前文章已有封面（编辑旧文章时使用）
let existingCoverImages = [];

function setStatus(el, msg, ok = false) {
  el.textContent = msg || "";
  el.classList.remove("status-ok", "status-error");
  if (!msg) return;
  el.classList.add(ok ? "status-ok" : "status-error");
}

function setMode(isEditing) {
  if (isEditing) {
    editorMode.textContent = "编辑文章";
    publishBtn.textContent = "更新文章";
    cancelEditBtn.style.display = "inline-flex";
  } else {
    editorMode.textContent = "新建文章";
    publishBtn.textContent = "发布文章";
    cancelEditBtn.style.display = "none";
  }
}

function clearForm() {
  editingId = null;
  existingCoverImages = [];

  titleEl.value = "";
  summaryEl.value = "";
  editorEl.innerHTML = "";

  coverImageFilesEl.value = "";
  coverPreviewEl.innerHTML = "";

  setStatus(publishStatus, "");
  setMode(false);
}

function saveSelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
}

function restoreSelection() {
  if (!savedRange) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(savedRange);
}

editorEl?.addEventListener("keyup", saveSelection);
editorEl?.addEventListener("mouseup", saveSelection);
editorEl?.addEventListener("focus", saveSelection);

document.querySelectorAll(".tool-btn[data-cmd]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const cmd = btn.dataset.cmd;
    const value = btn.dataset.value || null;

    editorEl.focus();
    restoreSelection();

    if (cmd === "blockquote") {
      document.execCommand("formatBlock", false, "blockquote");
    } else if (cmd === "formatBlock") {
      document.execCommand("formatBlock", false, value);
    } else {
      document.execCommand(cmd, false, value);
    }

    saveSelection();
  });
});

insertHrBtn?.addEventListener("click", () => {
  editorEl.focus();
  restoreSelection();
  document.execCommand("insertHorizontalRule");
  saveSelection();
});

function stripHtml(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}

function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPreviewFromUrls(urls = [], prefix = "封面") {
  coverPreviewEl.innerHTML = "";

  urls.forEach((url, index) => {
    const item = document.createElement("div");
    item.className = "preview-item";

    const img = document.createElement("img");
    img.src = url;

    const caption = document.createElement("div");
    caption.className = "preview-caption";
    caption.textContent = `${prefix} ${index + 1}`;

    item.appendChild(img);
    item.appendChild(caption);
    coverPreviewEl.appendChild(item);
  });
}

function renderCoverPreview() {
  coverPreviewEl.innerHTML = "";

  const files = Array.from(coverImageFilesEl.files || []);

  // 如果用户重新选择了新封面，就只显示新封面预览
  if (files.length > 0) {
    files.forEach((file, index) => {
      const item = document.createElement("div");
      item.className = "preview-item";

      const img = document.createElement("img");
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target.result;
      };

      reader.readAsDataURL(file);

      const caption = document.createElement("div");
      caption.className = "preview-caption";
      caption.textContent = `新封面 ${index + 1}`;

      item.appendChild(img);
      item.appendChild(caption);
      coverPreviewEl.appendChild(item);
    });

    return;
  }

  // 否则显示旧封面
  if (existingCoverImages.length > 0) {
    renderPreviewFromUrls(existingCoverImages, "当前封面");
  }
}

coverImageFilesEl?.addEventListener("change", renderCoverPreview);

async function uploadImages(files) {
  const urls = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-]/g, "_");
    const filePath = `news/${Date.now()}_${Math.random()
      .toString(36)
      .slice(2, 8)}_${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("news-images")
      .upload(filePath, file);

    if (uploadError) throw uploadError;

    const { data } = supabase.storage
      .from("news-images")
      .getPublicUrl(filePath);

    urls.push(data.publicUrl);
  }

  return urls;
}

function insertHtmlAtCursor(html) {
  editorEl.focus();
  restoreSelection();

  if (savedRange) {
    const range = savedRange;
    range.deleteContents();

    const temp = document.createElement("div");
    temp.innerHTML = html;

    const frag = document.createDocumentFragment();
    let node;
    let lastNode = null;

    while ((node = temp.firstChild)) {
      lastNode = frag.appendChild(node);
    }

    range.insertNode(frag);

    if (lastNode) {
      range.setStartAfter(lastNode);
      range.collapse(true);

      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      savedRange = range.cloneRange();
    }
  } else {
    editorEl.insertAdjacentHTML("beforeend", html);
  }
}

insertImageBtn?.addEventListener("click", () => {
  saveSelection();
  inlineImageInput.click();
});

inlineImageInput?.addEventListener("change", async () => {
  const files = Array.from(inlineImageInput.files || []);
  if (!files.length) return;

  setStatus(publishStatus, "正在上传正文插图…", true);

  try {
    const urls = await uploadImages(files);

    urls.forEach((url) => {
      insertHtmlAtCursor(`
        <figure class="article-figure">
          <img src="${escapeHtml(url)}" alt="新闻插图">
          <figcaption></figcaption>
        </figure>
        <p><br></p>
      `);
    });

    setStatus(publishStatus, "正文插图已插入。", true);
  } catch (err) {
    console.error(err);
    setStatus(publishStatus, "插图上传失败：" + err.message);
  } finally {
    inlineImageInput.value = "";
  }
});

async function saveArticle() {
  const title = titleEl.value.trim();
  const summary = summaryEl.value.trim();
  const htmlBody = editorEl.innerHTML.trim();
  const plainBody = stripHtml(htmlBody);

  if (!title || !summary || !plainBody) {
    setStatus(publishStatus, "标题、摘要、正文都不能为空。");
    return;
  }

  setStatus(publishStatus, editingId ? "正在更新…" : "正在发布…", true);

  try {
    let uploadedCoverImages = [];
    const coverFiles = Array.from(coverImageFilesEl.files || []);

    if (coverFiles.length > 0) {
      uploadedCoverImages = await uploadImages(coverFiles);
    }

    // 只认“封面上传区域”的图片作为封面
    // 如果编辑旧文章时没有重新上传封面，则保留原封面
    const finalCoverImages =
      uploadedCoverImages.length > 0
        ? uploadedCoverImages.filter(
            (src, index, arr) => src && arr.indexOf(src) === index
          )
        : existingCoverImages.filter(
            (src, index, arr) => src && arr.indexOf(src) === index
          );

    const primaryCoverImage =
      finalCoverImages.length > 0 ? finalCoverImages[0] : null;

    const payload = {
      title,
      slug: slugify(title),
      summary,
      content: htmlBody,
      html_body: htmlBody,
      body: plainBody,

      // 封面字段
      cover_image: primaryCoverImage,
      image_url: primaryCoverImage,
      cover_images: finalCoverImages,

      updated_at: new Date().toISOString(),
      published: true,
      author: "Darwin Life Hub",
      category: "local",
    };

    if (editingId) {
      const { error } = await supabase
        .from("news")
        .update(payload)
        .eq("id", editingId);

      if (error) throw error;

      setStatus(publishStatus, "文章已更新。", true);
    } else {
      const { error } = await supabase
        .from("news")
        .insert([
          {
            ...payload,
            created_at: new Date().toISOString(),
            views: 0,
            likes: 0,
            comments_count: 0,
            featured: false,
          },
        ]);

      if (error) throw error;

      setStatus(publishStatus, "发布成功。", true);
    }

    clearForm();
    await loadNews();
  } catch (err) {
    console.error(err);
    setStatus(publishStatus, "保存失败：" + err.message);
  }
}

publishBtn?.addEventListener("click", saveArticle);

cancelEditBtn?.addEventListener("click", () => {
  clearForm();
});

async function startEdit(id) {
  try {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .eq("id", id)
      .single();

    if (error) throw error;

    if (!data) {
      alert("这篇文章不存在。");
      return;
    }

    editingId = id;
    titleEl.value = data.title || "";
    summaryEl.value = data.summary || "";
    editorEl.innerHTML = data.html_body || data.content || "";

    // 读取旧封面
    if (Array.isArray(data.cover_images) && data.cover_images.length > 0) {
      existingCoverImages = data.cover_images.filter(Boolean);
    } else if (data.cover_image) {
      existingCoverImages = [data.cover_image];
    } else if (data.image_url) {
      existingCoverImages = [data.image_url];
    } else {
      existingCoverImages = [];
    }

    coverImageFilesEl.value = "";
    renderCoverPreview();

    setMode(true);
    setStatus(publishStatus, "已载入文章，可直接修改后保存。", true);

    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (err) {
    console.error(err);
    alert("载入文章失败：" + err.message);
  }
}

async function loadNews() {
  listEl.innerHTML = "";
  emptyHint.style.display = "none";

  try {
    const { data, error } = await supabase
      .from("news")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    if (!data || data.length === 0) {
      emptyHint.style.display = "block";
      emptyHint.textContent = "暂无新闻。";
      return;
    }

    data.forEach((row) => {
      const id = row.id;
      const createdText = row.created_at
        ? new Date(row.created_at).toLocaleString()
        : "时间未知";

      const item = document.createElement("div");
      item.className = "item";

      const top = document.createElement("div");
      top.className = "item-top";

      const left = document.createElement("div");

      const titleDiv = document.createElement("div");
      titleDiv.className = "item-title";
      titleDiv.textContent = row.title || "(无标题)";

      const metaDiv = document.createElement("div");
      metaDiv.className = "item-meta";
      metaDiv.textContent = createdText;

      left.appendChild(titleDiv);
      left.appendChild(metaDiv);
      top.appendChild(left);
      item.appendChild(top);

      const summaryDiv = document.createElement("div");
      summaryDiv.className = "item-meta";
      const summaryText = row.summary || "";
      summaryDiv.textContent =
        summaryText.slice(0, 90) + (summaryText.length > 90 ? "…" : "");
      item.appendChild(summaryDiv);

      const images = Array.isArray(row.cover_images)
        ? row.cover_images
        : row.cover_image
        ? [row.cover_image]
        : row.image_url
        ? [row.image_url]
        : [];

      if (images.length > 0) {
        const imgs = document.createElement("div");
        imgs.className = "item-images";

        images.slice(0, 3).forEach((src) => {
          const img = document.createElement("img");
          img.src = src;
          img.alt = "封面图";
          imgs.appendChild(img);
        });

        item.appendChild(imgs);
      }

      const actions = document.createElement("div");
      actions.className = "item-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "btn btn-sm btn-light";
      editBtn.textContent = "编辑";
      editBtn.addEventListener("click", () => startEdit(id));

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-sm btn-danger";
      delBtn.textContent = "删除";
      delBtn.addEventListener("click", async () => {
        if (!confirm("确定删除这条新闻吗？")) return;

        try {
          const { error } = await supabase.from("news").delete().eq("id", id);
          if (error) throw error;

          item.remove();

          if (!listEl.children.length) {
            emptyHint.style.display = "block";
            emptyHint.textContent = "暂无新闻。";
          }
        } catch (err) {
          console.error(err);
          alert("删除失败：" + err.message);
        }
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      item.appendChild(actions);

      listEl.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    emptyHint.style.display = "block";
    emptyHint.textContent = "加载失败：" + err.message;
  }
}

refreshBtn?.addEventListener("click", loadNews);

setMode(false);
loadNews();