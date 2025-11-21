// news.js
import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const listEl = document.getElementById("newsList");

const modal = document.getElementById("newsModal");
const modalBackdrop = document.getElementById("modalBackdrop");
const modalCloseBtn = document.getElementById("modalClose");
const modalTitle = document.getElementById("modalTitle");
const modalMeta = document.getElementById("modalMeta");
const modalBody = document.getElementById("modalBody");
const modalImageWrap = document.getElementById("modalImageWrap");
const modalImage = document.getElementById("modalImage");

function escapeAndFormat(body) {
  if (!body) return "";
  const esc = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc.replace(/\r\n|\r|\n/g, "<br>");
}

function openModal(news) {
  modalTitle.textContent = news.title;
  modalMeta.textContent = news.createdText || "";
  modalBody.innerHTML = escapeAndFormat(news.body || news.summary || "");

  if (news.imageUrl) {
    modalImage.src = news.imageUrl;
    modalImageWrap.style.display = "block";
  } else {
    modalImageWrap.style.display = "none";
  }

  modal.classList.add("show");
}

function closeModal() {
  modal.classList.remove("show");
}

modalBackdrop.addEventListener("click", closeModal);
modalCloseBtn.addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

async function loadNews() {
  listEl.innerHTML = "<p>加载中…</p>";

  try {
    const q = query(collection(db, "news"), orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      listEl.innerHTML = "<p>暂无新闻</p>";
      return;
    }

    listEl.innerHTML = "";

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();

      const createdText = data.createdAt?.toDate
        ? data.createdAt.toDate().toLocaleDateString("zh-CN")
        : "";

      const item = document.createElement("article");
      item.className = "news-item";
      item.innerHTML = `
        <div class="news-text">
          <h3 class="news-title">${data.title || "未命名新闻"}</h3>
          <p class="news-summary">${data.summary || ""}</p>
          <div class="news-meta">${createdText}</div>
        </div>
        <div class="news-image">
          <img src="${data.imageUrl || "https://via.placeholder.com/400x260?text=News"}" alt="news image">
        </div>
      `;

      item.addEventListener("click", () => {
        openModal({
          title: data.title || "未命名新闻",
          summary: data.summary || "",
          body: data.body || "",
          imageUrl: data.imageUrl || "",
          createdText,
        });
      });

      listEl.appendChild(item);
    });
  } catch (error) {
    console.error(error);
    listEl.innerHTML = "加载失败：" + error.message;
  }
}

loadNews();
