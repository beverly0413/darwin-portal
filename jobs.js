// jobs.js
// 前端招聘列表：文字持久化到 localStorage，图片只在本次打开期间保存在内存里

const STORAGE_KEY = 'darwin_life_hub_jobs_v2';

const MAX_IMAGES = 5;
let jobImagesList = [];   // 当前这条招聘选中的图片（File 对象）
let jobsMemory = [];      // 本次会话中的招聘列表（包含 images）

// 只从 localStorage 读取“文字部分”的招聘数据
function loadJobsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed; // 这里本来就没有 images 字段
  } catch (e) {
    console.error('解析本地招聘数据失败：', e);
    return [];
  }
}

// 只把“文字部分”写回 localStorage（不保存图片，避免超出配额）
function saveJobsToStorageTextOnly() {
  try {
    const textOnly = jobsMemory.map((job) => ({
      id: job.id,
      title: job.title,
      company: job.company,
      contact: job.contact,
      content: job.content,
      createdAt: job.createdAt,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(textOnly));
  } catch (e) {
    console.error('保存本地招聘数据失败：', e);
  }
}

// ===== 刷新图片预览：支持单张删除 =====
function updateJobPreview() {
  const previewEl = document.getElementById('jobPreview');
  if (!previewEl) return;

  previewEl.innerHTML = '';

  jobImagesList.forEach((file, index) => {
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
      // 删除当前这张，再刷新预览
      jobImagesList.splice(index, 1);
      updateJobPreview();
    });

    wrapper.appendChild(img);
    wrapper.appendChild(removeBtn);
    previewEl.appendChild(wrapper);
  });
}

// 把 File 列表转换成 DataURL 数组（只存内存，用于展示）
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

// 渲染列表：使用 jobsMemory（包含 images）
function renderJobs() {
  const listEl = document.getElementById('jobList');
  if (!listEl) return;

  listEl.innerHTML = '';

  if (jobsMemory.length === 0) {
    listEl.innerHTML =
      '<p style="font-size:13px;color:#6b7280;">目前还没有招聘信息，欢迎发布第一条。</p>';
    return;
  }

  jobsMemory.forEach((job) => {
    const div = document.createElement('div');
    div.className = 'job';

    const title = job.title || '未命名职位';
    const company = job.company || '';
    const contact = job.contact || '';
    const content = job.content || '';
    const createdAt = job.createdAt ? new Date(job.createdAt) : new Date();

    const dateStr = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, '0')}-${String(createdAt.getDate()).padStart(2, '0')}`;

    let imagesHtml = '';
    if (Array.isArray(job.images) && job.images.length > 0) {
      imagesHtml = `
        <div class="job-photos">
          ${job.images
            .map(
              (url) => `<img src="${url}" alt="职位相关图片" loading="lazy" />`
            )
            .join('')}
        </div>
      `;
    }

    div.innerHTML = `
      <h3>${title}</h3>
      ${company ? `<p><strong>店铺 / 公司：</strong>${company}</p>` : ''}
      ${contact ? `<p><strong>联系方式：</strong>${contact}</p>` : ''}
      ${content ? `<p style="white-space:pre-wrap;">${content}</p>` : ''}
      ${imagesHtml}
      <small>发布于：${dateStr}</small>
    `;

    listEl.appendChild(div);
  });
}

// 表单逻辑
function setupForm() {
  const form = document.getElementById('jobForm');
  const statusEl = document.getElementById('jobStatus');
  const imagesInput = document.getElementById('jobImages');
  const clearBtn = document.getElementById('jobClearImages');

  if (!form) return;

  // 监听图片选择：多次选择累加，最多 5 张
  if (imagesInput) {
    imagesInput.addEventListener('change', (e) => {
      const newFiles = Array.from(e.target.files || []);

      for (const file of newFiles) {
        if (jobImagesList.length >= MAX_IMAGES) break;
        jobImagesList.push(file);
      }

      imagesInput.value = ''; // 清空，避免同一文件不能再次选择
      updateJobPreview();
    });
  }

  // 清空所有图片
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      jobImagesList = [];
      updateJobPreview();
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const titleEl = document.getElementById('jobTitle');
    const companyEl = document.getElementById('jobCompany');
    const contactEl = document.getElementById('jobContact');
    const contentEl = document.getElementById('jobContent');

    const title = titleEl.value.trim();
    const company = companyEl.value.trim();
    const contact = contactEl.value.trim();
    const content = contentEl.value.trim();

    if (!title) {
      statusEl.textContent = '职位名称是必填项。';
      statusEl.style.color = 'red';
      return;
    }
    if (!contact) {
      statusEl.textContent = '联系方式是必填项。';
      statusEl.style.color = 'red';
      return;
    }
    if (jobImagesList.length > MAX_IMAGES) {
      statusEl.textContent = '最多只能上传 5 张照片。';
      statusEl.style.color = 'red';
      return;
    }

    statusEl.textContent = '正在保存...';
    statusEl.style.color = '#6b7280';

    let imageDataUrls = [];
    try {
      if (jobImagesList.length > 0) {
        imageDataUrls = await readFilesAsDataUrls(jobImagesList);
      }
    } catch (err) {
      console.error('读取图片失败：', err);
      statusEl.textContent = '读取图片失败，请重试。';
      statusEl.style.color = 'red';
      return;
    }

    const newJob = {
      id: Date.now(),
      title,
      company,
      contact,
      content,
      createdAt: new Date().toISOString(),
      images: imageDataUrls, // 只在 jobsMemory 里存在
    };

    jobsMemory.unshift(newJob);
    saveJobsToStorageTextOnly();
    renderJobs();

    form.reset();
    statusEl.textContent = '发布成功（文字已保存在本浏览器）。';
    statusEl.style.color = 'green';

    jobImagesList = [];
    updateJobPreview();
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  jobsMemory = loadJobsFromStorage();
  renderJobs();
  setupForm();
});
