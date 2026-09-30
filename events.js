// Public events are sourced only from the database. Never substitute sample listings.
const EVENT_TIME_ZONE = "Australia/Darwin";
const EVENT_METADATA_PREFIX = "<!--darwinbbs:metadata ";
const EVENT_PAGE_SIZE = 500;
const EVENT_MAX_PAGES = 20;
const EVENT_MAX_VERIFICATION_AGE = 36 * 60 * 60 * 1000;
let allEvents = [];
let activeFilter = "all";
let searchTerm = "";
let eventsLoadState = "loading";
let eventsLoadMessage = "正在加载活动...";
let eventsPartial = false;
let eventsRequestId = 0;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function safeEventUrl(value) {
  if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return "";
  try {
    const url = new URL(value.trim());
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      ? url.href : "";
  } catch {
    return "";
  }
}

function validEventDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function eventTimestamp(value) {
  if (typeof value !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
      !validEventDate(value.slice(0, 10))) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function darwinEventDay(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: EVENT_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(value));
}

function parseEventMetadata(content) {
  const text = typeof content === "string" ? content : "";
  if (!text.startsWith(EVENT_METADATA_PREFIX)) return { marked: false, text, metadata: null };
  const end = text.indexOf(" -->", EVENT_METADATA_PREFIX.length);
  const result = { marked: true, text: end < 0 ? "" : text.slice(end + 4).trimStart(), metadata: null };
  if (end < 0) return result;
  try {
    const data = JSON.parse(text.slice(EVENT_METADATA_PREFIX.length, end));
    if (!data || data.version !== 1 || data.type !== "events" ||
        (data.sourcePublishedAt !== null && eventTimestamp(data.sourcePublishedAt) === null) ||
        eventTimestamp(data.verifiedAt) === null || !safeEventUrl(data.sourceUrl) ||
        (data.expiresAt !== null && eventTimestamp(data.expiresAt) === null)) return result;
    result.metadata = data;
  } catch {
    // Invalid metadata is not evidence that an event is current.
  }
  return result;
}

function formatEventDate(value) {
  if (!value) return "日期未确认，请查看来源";
  const timestamp = validEventDate(value) ? Date.parse(`${value}T00:00:00+09:30`) : eventTimestamp(value);
  if (timestamp === null) return "日期未确认，请查看来源";
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    timeZone: EVENT_TIME_ZONE, year: "numeric", month: "short", day: "numeric", weekday: "short",
  });
}

function normalizeEvent(row, now = Date.now()) {
  const parsed = parseEventMetadata(row.description);
  if (parsed.marked && !parsed.metadata) return null;
  const metadata = parsed.metadata;
  if (metadata) {
    const verifiedAt = eventTimestamp(metadata.verifiedAt);
    if (verifiedAt > now + 5 * 60 * 1000 || now - verifiedAt > EVENT_MAX_VERIFICATION_AGE) return null;
  }
  const expiresAt = metadata?.expiresAt ? eventTimestamp(metadata.expiresAt) : null;
  if (expiresAt !== null && expiresAt <= now) return null;

  const startsAt = eventTimestamp(row.starts_at);
  const eventDay = validEventDate(row.event_date) ? row.event_date :
    startsAt !== null ? darwinEventDay(startsAt) : null;
  // Legacy entries have no end time. Keep today's events, but never roll yesterday forward.
  if (eventDay && eventDay < darwinEventDay(now) && expiresAt === null) return null;
  if (metadata && !eventDay) return null;

  return {
    title: row.title || "未命名活动",
    date: formatEventDate(eventDay),
    eventDay,
    dateConfirmed: Boolean(eventDay),
    location: row.location || "地点待确认",
    price: row.price || row.price_label || "价格待确认",
    category: [row.category, row.tags].filter(Boolean).join(" "),
    summary: row.summary || parsed.text || "",
    source_url: safeEventUrl(row.source_url) || safeEventUrl(metadata?.sourceUrl),
  };
}

async function loadEvents() {
  const requestId = ++eventsRequestId;
  allEvents = [];
  eventsPartial = false;
  eventsLoadState = "loading";
  eventsLoadMessage = "正在加载活动...";
  renderEvents();

  try {
    if (!window.supabaseClient) throw new Error("活动数据服务尚未连接");
    const rows = [];
    for (let page = 0; page < EVENT_MAX_PAGES; page += 1) {
      const { data, error } = await window.supabaseClient
        .from("events")
        .select("id, title, summary, description, event_date, starts_at, location, price, price_label, category, tags, source_url")
        .order("event_date", { ascending: false, nullsFirst: false })
        .order("id", { ascending: true })
        .range(page * EVENT_PAGE_SIZE, (page + 1) * EVENT_PAGE_SIZE - 1);
      if (requestId !== eventsRequestId) return;
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("活动数据返回格式错误");
      rows.push(...data);
      if (data.length < EVENT_PAGE_SIZE) break;
      if (page === EVENT_MAX_PAGES - 1) eventsPartial = true;
    }
    const now = Date.now();
    allEvents = rows.map((row) => normalizeEvent(row, now)).filter(Boolean)
      .sort((a, b) => (a.eventDay || "9999").localeCompare(b.eventDay || "9999"));
    eventsLoadState = "ready";
    eventsLoadMessage = rows.length
      ? "暂无可展示的活动。已结束、日期信息无效或未能及时更新来源状态的自动采集活动不会展示。"
      : "暂无活动记录。新的活动资料发布后会显示在这里。";
  } catch (error) {
    if (requestId !== eventsRequestId) return;
    console.error("加载活动失败：", error);
    allEvents = [];
    eventsLoadState = "error";
    eventsLoadMessage = "活动暂时无法加载，请点击重试。当前无法确认是否有活动。";
  }
  renderEvents();
}

function eventMatches(event) {
  const category = String(event.category || "").toLowerCase();
  const haystack = `${event.title} ${event.location} ${event.summary} ${category}`.toLowerCase();
  return (activeFilter === "all" || category.includes(activeFilter)) &&
    (!searchTerm || haystack.includes(searchTerm.toLowerCase()));
}

function renderEvents() {
  const grid = document.getElementById("eventsGrid");
  const status = document.getElementById("eventsStatus");
  const retry = document.getElementById("eventsRetry");
  grid.innerHTML = "";
  grid.setAttribute("aria-busy", String(eventsLoadState === "loading"));
  if (retry) {
    retry.hidden = eventsLoadState === "loading";
    retry.disabled = eventsLoadState === "loading";
    retry.textContent = eventsLoadState === "error" ? "重试" : "刷新活动";
  }
  if (eventsLoadState !== "ready" || !allEvents.length) {
    status.textContent = eventsLoadMessage;
    return;
  }
  const events = allEvents.filter(eventMatches);
  if (!events.length) {
    status.textContent = "没有找到匹配的活动，请尝试其他关键词或分类。";
    return;
  }
  const unknownCount = events.filter((event) => !event.dateConfirmed).length;
  status.textContent = `当前显示 ${events.length} 个活动。` +
    (unknownCount ? `其中 ${unknownCount} 个日期待确认，不能视为近期活动。` : "") +
    (eventsPartial ? "活动较多，目前仅展示部分记录。" : "");

  events.forEach((event) => {
    const card = document.createElement(event.source_url ? "a" : "article");
    card.className = "event-card";
    if (event.source_url) {
      card.href = event.source_url;
      card.target = "_blank";
      card.rel = "noopener noreferrer";
    }
    card.innerHTML = `
      <span class="feature-tag">${escapeHtml(event.dateConfirmed ? event.price : "日期待确认")}</span>
      <h3>${escapeHtml(event.title)}</h3>
      <p>${escapeHtml(event.summary)}</p>
      <div style="margin-top:14px;display:grid;gap:6px;color:var(--muted);font-size:13px;">
        <span>时间：${escapeHtml(event.date)}</span>
        <span>地点：${escapeHtml(event.location)}</span>
        ${event.source_url ? "<span>查看原始活动信息 ↗</span>" : "<span>暂无来源链接，请先确认活动安排</span>"}
      </div>
    `;
    grid.appendChild(card);
  });
}

function setupFilters() {
  document.querySelectorAll("#eventFilters button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("#eventFilters button").forEach((item) => {
        item.classList.remove("active");
        item.setAttribute("aria-pressed", "false");
      });
      button.classList.add("active");
      button.setAttribute("aria-pressed", "true");
      activeFilter = button.dataset.filter || "all";
      renderEvents();
    });
  });
}

function setupSearch() {
  const input = document.getElementById("eventSearch");
  const button = document.getElementById("eventSearchBtn");
  const initial = new URLSearchParams(window.location.search).get("q") || "";
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
  document.getElementById("eventsRetry")?.addEventListener("click", loadEvents);
  loadEvents();
});
