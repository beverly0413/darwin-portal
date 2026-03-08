import { db } from "./firebase.js";
import {
  collection,
  addDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  deleteDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const supabase = window.supabaseClient;

const titleEl = document.getElementById("newsTitle");
const summaryEl = document.getElementById("newsSummary");
const bodyEl = document.getElementById("newsBody");
const imageFilesEl = document.getElementById("newsImageFiles");
const imagePreviewEl = document.getElementById("imagePreview");
const publishBtn = document.getElementById("publishBtn");
const publishStatus = document.getElementById("publishStatus");

const refreshBtn = document.getElementById("refreshBtn");
const listEl = document.getElementById("newsList");
const emptyHint = document.getElementById("emptyHint");

function setStatus(el, msg, ok = false) {
  el.textContent = msg || "";
  el.classList.remove("status-ok", "status-error");
  if (!msg) return;
  el.classList.add(ok ? "status-ok" : "status-error");
}

function renderPreview() {
  if (!imagePreviewEl || !imageFilesEl) return;
  imagePreviewEl.innerHTML = "";

  const files = Array.from(imageFilesEl.files || []);
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
    caption.textContent = `img${index + 1}`;

    item.appendChild(img);
    item.appendChild(caption);
    imagePreviewEl.appendChild(item);
  });
}

imageFilesEl?.addEventListener("change", renderPreview);

async function uploadImages(files) {
  const urls = [];

  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-]/g, "_");
    const filePath = `news/${Date.now()}_${Math.random().toString(36).slice(2, 8)}_${safeName}`;

    const { error } = await supabase.storage
      .from("news-images")
      .upload(filePath, file);

    if (error) throw error;

    const { data } = supabase.storage
      .from("news-images")
      .getPublicUrl(filePath);

    urls.push(data.publicUrl);
  }

  return urls;
}

function buildBodyBlocks(rawBody, imageUrls) {
  const blocks = [];
  const usedImageIndexes = new Set();

  const parts = rawBody
    .split(/\n\s*\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

  parts.forEach((part) => {
    const imgMatch = part.match(/^\[img(\d+)\]$/i);

    if (imgMatch) {
      const imgIndex = Number(imgMatch[1]) - 1;
      if (imageUrls[imgIndex]) {
        usedImageIndexes.add(imgIndex);
        blocks.push({
          type: "image",
          url: imageUrls[imgIndex],
          imageIndex: imgIndex + 1,
        });
      }
      return;
    }

    blocks.push({
      type: "paragraph",
      text: part,
    });
  });

  const unusedImages = imageUrls
    .map((url, index) => ({ url, index }))
    .filter((item) => !usedImageIndexes.has(item.index));

  if (unusedImages.length > 0) {
    blocks.push({
      type: "gallery",
      images: unusedImages.map((item) => item.url),
    });
  }

  return blocks;
}

publishBtn.addEventListener("click", async () => {
  const title = titleEl.value.trim();
  const summary = summaryEl.value.trim();
  const rawBody = bodyEl.value.trim();
  const files = Array.from(imageFilesEl.files || []);

  if (!title || !summary || !rawBody) {
    setStatus(publishStatus, "标题、摘要、正文都不能为空。");
    return;
  }

  setStatus(publishStatus, "正在发布…", true);

  try {
    let imageUrls = [];

    if (files.length > 0) {
      imageUrls = await uploadImages(files);
    }

    const bodyBlocks = buildBodyBlocks(rawBody, imageUrls);

    await addDoc(collection(db, "news"), {
      title,
      summary,
      body: rawBody,
      bodyBlocks,
      coverImages: imageUrls,
      imageUrl: imageUrls[0] || null,
      createdAt: serverTimestamp(),
    });

    titleEl.value = "";
    summaryEl.value = "";
    bodyEl.value = "";
    imageFilesEl.value = "";
    imagePreviewEl.innerHTML = "";

    setStatus(publishStatus, "发布成功。", true);
    loadNews();
  } catch (err) {
    console.error(err);
    setStatus(publishStatus, "发布失败：" + err.message);
  }
});

async function loadNews() {
  listEl.innerHTML = "";
  emptyHint.style.display = "none";

  try {
    const q = query(
      collection(db, "news"),
      orderBy("createdAt", "desc"),
      limit(30)
    );

    const snap = await getDocs(q);

    if (snap.empty) {
      emptyHint.style.display = "block";
      emptyHint.textContent = "暂无新闻。";
      return;
    }

    snap.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;
      const createdText = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleString()
        : "时间未知";

      const item = document.createElement("div");
      item.className = "item";

      const top = document.createElement("div");
      top.className = "item-top";

      const left = document.createElement("div");
      const titleDiv = document.createElement("div");
      titleDiv.className = "item-title";
      titleDiv.textContent = data.title || "(无标题)";

      const metaDiv = document.createElement("div");
      metaDiv.className = "item-meta";
      metaDiv.textContent = createdText;

      left.appendChild(titleDiv);
      left.appendChild(metaDiv);

      const delBtn = document.createElement("button");
      delBtn.className = "btn btn-sm btn-danger";
      delBtn.textContent = "删除";

      delBtn.addEventListener("click", async () => {
        if (!confirm("确定删除这条新闻吗？")) return;

        try {
          await deleteDoc(doc(db, "news", id));
          item.remove();
        } catch (err) {
          alert("删除失败：" + err.message);
        }
      });

      top.appendChild(left);
      top.appendChild(delBtn);

      const summaryDiv = document.createElement("div");
      summaryDiv.className = "item-meta";
      summaryDiv.textContent =
        (data.summary || "").slice(0, 90) +
        ((data.summary || "").length > 90 ? "…" : "");

      item.appendChild(top);
      item.appendChild(summaryDiv);

      const images = Array.isArray(data.coverImages) ? data.coverImages : [];
      if (images.length > 0) {
        const imgs = document.createElement("div");
        imgs.className = "item-images";
        images.slice(0, 3).forEach((src) => {
          const img = document.createElement("img");
          img.src = src;
          imgs.appendChild(img);
        });
        item.appendChild(imgs);
      }

      listEl.appendChild(item);
    });
  } catch (err) {
    console.error(err);
    emptyHint.style.display = "block";
    emptyHint.textContent = "加载失败：" + err.message;
  }
}

refreshBtn.addEventListener("click", loadNews);
loadNews();