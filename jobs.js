// jobs.js
// 一个简单的前端招聘列表管理：用 localStorage 存在浏览器本地

const STORAGE_KEY = 'darwin_life_hub_jobs';

// 读取本地存储的招聘数据
function loadJobsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch (e) {
    console.error('解析本地招聘数据失败：', e);
    return [];
  }
}

// 保存招聘数据到本地
function saveJobsToStorage(jobs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs));
  } catch (e) {
    console.error('保存本地招聘数据失败：', e);
  }
}

// 渲染列表
function renderJobs() {
  const listEl = document.getElementById('jobList');
  if (!listEl) return;

  const jobs = loadJobsFromStorage();

  listEl.innerHTML = '';

  if (jobs.length === 0) {
    listEl.innerHTML = '<p style="font-size:13px;color:#6b7280;">目前还没有招聘信息，欢迎发布第一条。</p>';
    return;
  }

  // 最新发布的显示在最上面
  jobs.forEach((job) => {
    const div = document.createElement('div');
    div.className = 'job';

    const title = job.title || '未命名职位';
    const company = job.company || '';
    const contact = job.contact || '';
    const content = job.content || '';
    const createdAt = job.createdAt
      ? new Date(job.createdAt)
      : new Date();

    // 简单格式化时间
    const dateStr = `${createdAt.getFullYear()}-${String(createdAt.getMonth()+1).padStart(2,'0')}-${String(createdAt.getDate()).padStart(2,'0')}`;

    div.innerHTML = `
      <h3>${title}</h3>
      ${
        company
          ? `<p><strong>店铺 / 公司：</strong>${company}</p>`
          : ''
      }
      ${
        contact
          ? `<p><strong>联系方式：</strong>${contact}</p>`
          : ''
      }
      ${
        content
          ? `<p style="white-space:pre-wrap;">${content}</p>`
          : ''
      }
      <small>发布于：${dateStr}</small>
    `;

    listEl.appendChild(div);
  });
}

// 处理表单提交
function setupForm() {
  const form = document.getElementById('jobForm');
  const statusEl = document.getElementById('jobStatus');

  if (!form) return;

  form.addEventListener('submit', (e) => {
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

    const jobs = loadJobsFromStorage();

    // 新招聘放在数组最前面
    jobs.unshift({
      id: Date.now(),
      title,
      company,
      contact,
      content,
      createdAt: new Date().toISOString(),
    });

    saveJobsToStorage(jobs);
    renderJobs();

    form.reset();
    statusEl.textContent = '发布成功（仅保存在当前浏览器中）。';
    statusEl.style.color = 'green';
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  renderJobs();
  setupForm();
});
