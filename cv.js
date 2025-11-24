// cv.js
// 求职页面：文字信息保存在 localStorage，图片只在本次浏览会话中保存在内存

const STORAGE_KEY = 'darwin_life_hub_cvs_v2';

const MAX_IMAGES = 5;
let cvImagesList = [];    // 当前要发布这条求职的图片（File 对象数组）
let cvsMemory = [];       // 本次会话中的求职列表（包含 images）

// 从 localStorage 读取文字信息
function loadCvsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.error('解析本地求职数据失败：', e);
    return [];
  }
}

// 只把文字部分写回 localStorage，避免图片过大占满配额
function saveCvsToStorageTextOnly() {
  try {
    const textOnly = cvsMemory.map((cv) => ({
      id: cv.id,
      title: cv.title,
      contact: cv.contact,
      content: cv.content,
      createdAt: cv.createdAt,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnly));
  } catch (e) {
    console.error('保存本地求职数据失败：', e);
  }
}

// 刷新图片预览（支持单张删除）
function updateCvPreview() {
  const previewEl = document.getElementById('cvPreview');
  if (!previewEl) return;

  previewEl.innerHTML = '';

  cvImagesList.forEach((file, index) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'preview-item';

    const img = document.createElement('img');
    img.alt = file.name;

    const reader = new FileReader();
    reader.onload = (ev) => {
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.textContent = '×';
    removeBtn.className = 'preview-remove';
    removeBtn.addEventListener('click', () => {
      cvImagesList.splice(index, 1);
      updateCvPreview();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    previewEl.appendChild(wrapper);
  });
}

// File 列表 -> DataURL 数组（只放在内存用于展示）
function readFilesAsDataUrls(files) {
  const list = Array.from(files);
  return Promise.all(
    list.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (ev) => resolve(ev.target.result);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
    )
  );
}

// 渲染求职列表（使用 cvsMemory）
function renderCvs() {
  const listEl = document.getElementById('cvList');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (cvsMemory.length === 0) {
    listEl.innerHTML =
      '<p style="font-size:13px;color:#6b7280;">目前还没有求职信息，欢迎发布第一条。</p>';
    return;
  }

  cvsMemory.forEach((cv) => {
    const div = document.createElement('div');
    div.className = 'post';

    const title = cv.title || '匿名求职';
    const contact = cv.contact || '';
    const content = cv.content || '';
    const createdAt = cv.createdAt ? new Date(cv.createdAt) : new Date();

    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`;

    let imagesHtml = '';
    if (Array.isArray(cv.images) && cv.images.length > 0) {
      imagesHtml = `
        <div class="cv-photos">
          ${cv.images
            .map(
              (url) => `<img src="${url}" alt="求职相关图片" loading="lazy" />`
            )
            .join('')}
        </div>
      `;
    }

    div.innerHTML = `
      <h3>${title}</h3>
      ${contact ? `<p><strong>联系方式：</strong>${contact}</p>` : ''}
      ${content ? `<p style="white-space:pre-wrap;">${content}</p>` : ''}
      ${imagesHtml}
      <small>发布于：${dateStr}</small>
    `;
    listEl.appendChild(div);
  });
}

// 设置表单逻辑
function setupCvForm() {
  const form = document.getElementById('cvForm');
  const statusEl = document.getElementById('cvStatus');
  const imagesInput = document.getElementById('cvImages');
  const clearBtn = document.getElementById('cvClearImages');

  if (!form) return;

  // 图片选择：多次选择累加，最多 5 张
  if (imagesInput) {
    imagesInput.addEventListener('change', (e) => {
      const newFiles = Array.from(e.target.files || []);

      for (const file of newFiles) {
        if (cvImagesList.length >= MAX_IMAGES) break;
        cvImagesList.push(file);
      }

      imagesInput.value = ''; // 清空，避免同一文件不能再次选择
      updateCvPreview();
    });
  }

  // 清空所有图片
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      cvImagesList = [];
      updateCvPreview();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titleEl = document.getElementById('cvTitle');
    const contactEl = document.getElementById('cvContact');
    const contentEl = document.getElementById('cvContent');

    const title = titleEl.value.trim();
    const contact = contactEl.value.trim();
    const content = contentEl.value.trim();

    if (!title) {
      statusEl.textContent = '职位方向 / 标题是必填项。';
      statusEl.style.color = 'red';
      return;
    }
    if (!contact) {
      statusEl.textContent = '联系方式是必填项。';
      statusEl.style.color = 'red';
      return;
    }
    if (cvImagesList.length > MAX_IMAGES) {
      statusEl.textContent = '最多只能上传 5 张照片。';
      statusEl.style.color = 'red';
      return;
    }

    // ✨ 关键新增：发布前检查是否登录（和 jobs / rent / forum 一样）
    try {
      const { data, error } = await supabaseClient.auth.getUser();
      if (error || !data?.user) {
        alert('请先登录后再发布求职信息。');
        window.location.href = 'login.html';
        return;
      }
    } catch (err) {
      console.error('检查登录状态失败：', err);
      alert('登录状态异常，请重新登录。');
      window.location.href = 'login.html';
      return;
    }

    statusEl.textContent = '正在保存...';
    statusEl.style.color = '#6b7280';

    // 把当前图片转成 DataURL（只放 cvsMemory，用于展示）
    let imageDataUrls = [];
    try {
      if (cvImagesList.length > 0) {
        imageDataUrls = await readFilesAsDataUrls(cvImagesList);
      }
    } catch (err) {
      console.error('读取图片失败：', err);
      statusEl.textContent = '读取图片失败，请重试。';
      statusEl.style.color = 'red';
      return;
    }

    const newCv = {
      id: Date.now(),
      title,
      contact,
      content,
      createdAt: new Date().toISOString(),
      images: imageDataUrls,
    };

    cvsMemory.unshift(newCv);
    saveCvsToStorageTextOnly();
    renderCvs();

    form.reset();
    statusEl.textContent = '求职信息已保存（仅当前浏览器可见）。';
    statusEl.style.color = 'green';

    cvImagesList = [];
    updateCvPreview();
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  cvsMemory = loadCvsFromStorage();
  renderCvs();
  setupCvForm();
});
