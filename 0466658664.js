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
const imageFileEl = document.getElementById("newsImageFile");
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

async function uploadImage(file) {
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const filePath = `news/${Date.now()}_${safeName}`;

  const { error } = await supabase.storage
    .from("news-images")
    .upload(filePath, file);

  if (error) throw error;

  const { data } = supabase.storage
    .from("news-images")
    .getPublicUrl(filePath);

  return data.publicUrl;
}

publishBtn.addEventListener("click", async () => {
  const title = titleEl.value.trim();
  const summary = summaryEl.value.trim();
  const body = bodyEl.value.trim();
  const file = imageFileEl.files[0];

  if (!title || !summary || !body) {
    setStatus(publishStatus, "标题、摘要、正文都不能为空。");
    return;
  }

  setStatus(publishStatus, "正在发布…", true);

  try {
    let imageUrl = null;

    if (file) {
      imageUrl = await uploadImage(file);
    }

    await addDoc(collection(db, "news"), {
      title,
      summary,
      body,
      imageUrl,
      createdAt: serverTimestamp(),
    });

    titleEl.value = "";
    summaryEl.value = "";
    bodyEl.value = "";
    imageFileEl.value = "";

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
        (data.summary || "").slice(0, 60) +
        (data.summary && data.summary.length > 60 ? "…" : "");

      item.appendChild(top);
      item.appendChild(summaryDiv);

      if (data.imageUrl) {
        const img = document.createElement("img");
        img.src = data.imageUrl;
        img.style.maxWidth = "120px";
        img.style.marginTop = "6px";
        item.appendChild(img);
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