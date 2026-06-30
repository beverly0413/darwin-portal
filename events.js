const fallbackEvents = [
  {
    title: "Mindil Beach Sunset Market",
    date: "本周四 / 周日",
    location: "Mindil Beach",
    price: "免费入场",
    category: "market free",
    summary: "达尔文最有代表性的海边市集，适合看日落、吃小吃、带朋友散步。",
  },
  {
    title: "Darwin Waterfront Weekend",
    date: "本周末",
    location: "Darwin Waterfront",
    price: "部分免费",
    category: "family free",
    summary: "适合家庭和新朋友的轻松周末活动，吃饭、散步、亲水区都方便。",
  },
  {
    title: "Live Music Night",
    date: "周五晚上",
    location: "Darwin CBD",
    price: "按场地",
    category: "music nightlife",
    summary: "整理 CBD 周边酒吧和 live music 场地，适合下班后找地方坐一坐。",
  },
  {
    title: "Community Sports & Outdoor",
    date: "周六上午",
    location: "Casuarina / Nightcliff",
    price: "免费或低价",
    category: "family free",
    summary: "户外运动、社区聚会和适合新人认识朋友的轻量活动。",
  },
  {
    title: "Local Art & Museum Picks",
    date: "本月",
    location: "Museum and Art Gallery NT",
    price: "免费",
    category: "free family",
    summary: "适合避暑、亲子和了解北领地文化的展览活动。",
  },
  {
    title: "Food Trucks & Pop-up Dining",
    date: "滚动更新",
    location: "Darwin region",
    price: "按商家",
    category: "market nightlife",
    summary: "收集达尔文流动餐车、快闪餐饮和周末小吃活动。",
  },
];

let allEvents = [];
let activeFilter = "all";
let searchTerm = "";

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatEventDate(value) {
  if (!value) return "时间待确认";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function normalizeEvent(row) {
  return {
    title: row.title || "未命名活动",
    date: formatEventDate(row.event_date || row.date || row.starts_at),
    location: row.location || "地点待确认",
    price: row.price || row.price_label || "价格待确认",
    category: row.category || row.tags || "",
    summary: row.summary || row.description || "",
    source_url: row.source_url || row.url || "",
  };
}

async function loadEvents() {
  const status = document.getElementById("eventsStatus");

  if (!window.supabaseClient) {
    allEvents = fallbackEvents;
    status.textContent = "当前显示推荐活动样例。";
    renderEvents();
    return;
  }

  const { data, error } = await supabaseClient
    .from("events")
    .select("title, summary, description, event_date, starts_at, location, price, price_label, category, tags, source_url, url")
    .order("event_date", { ascending: true })
    .limit(60);

  if (error || !data?.length) {
    console.error("加载活动失败：", error);
    allEvents = fallbackEvents;
    status.textContent = "活动数据库还未启用，当前显示推荐活动样例。";
    renderEvents();
    return;
  }

  allEvents = data.map(normalizeEvent);
  status.textContent = `共找到 ${allEvents.length} 个活动。`;
  renderEvents();
}

function eventMatches(event) {
  const category = String(event.category || "").toLowerCase();
  const haystack = `${event.title} ${event.location} ${event.summary} ${category}`.toLowerCase();
  const filterOk = activeFilter === "all" || category.includes(activeFilter);
  const searchOk = !searchTerm || haystack.includes(searchTerm.toLowerCase());
  return filterOk && searchOk;
}

function renderEvents() {
  const grid = document.getElementById("eventsGrid");
  const status = document.getElementById("eventsStatus");
  const events = allEvents.filter(eventMatches);

  grid.innerHTML = "";
  if (!events.length) {
    status.textContent = "没有找到匹配的活动。";
    return;
  }

  if (allEvents.length) {
    status.textContent = `当前显示 ${events.length} 个活动。`;
  }

  events.forEach((event) => {
    const card = document.createElement(event.source_url ? "a" : "article");
    card.className = "event-card";
    if (event.source_url) {
      card.href = event.source_url;
      card.target = "_blank";
      card.rel = "noopener";
    }

    card.innerHTML = `
      <span class="feature-tag">${escapeHtml(event.price)}</span>
      <h3>${escapeHtml(event.title)}</h3>
      <p>${escapeHtml(event.summary)}</p>
      <div style="margin-top:14px;display:grid;gap:6px;color:var(--muted);font-size:13px;">
        <span>时间：${escapeHtml(event.date)}</span>
        <span>地点：${escapeHtml(event.location)}</span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function setupFilters() {
  document.querySelectorAll("#eventFilters button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("#eventFilters button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      activeFilter = button.dataset.filter || "all";
      renderEvents();
    });
  });
}

function setupSearch() {
  const input = document.getElementById("eventSearch");
  const button = document.getElementById("eventSearchBtn");
  const params = new URLSearchParams(window.location.search);
  const initial = params.get("q") || "";
  input.value = initial;
  searchTerm = initial;

  const run = () => {
    searchTerm = input.value.trim();
    renderEvents();
  };

  button.addEventListener("click", run);
  input.addEventListener("input", run);
}

document.addEventListener("DOMContentLoaded", () => {
  setupFilters();
  setupSearch();
  loadEvents();
});
