import crypto from "node:crypto";

const DAY = 86400000;
const TABLES = { news: "news", jobs: "jobs_posts", events: "events" };
export const METADATA_PREFIX = "<!--darwinbbs:metadata ";

export function needsEditorialReview(item) {
  // Conservative publication gate. These items need a specific editorial decision;
  // a trusted source alone does not authorize amplifying personal allegations.
  const text = `${item.title || ""} ${item.excerpt || ""}`;
  return /\b(?:charged|charges|accused|alleged|allegations?|arrested|murder|rape|sexual assault|suicide|self[- ]harm|diagnosed|bankrupt(?:cy)?)\b/i.test(text)
    || /\b(?:child|children|teenager|teen|boy|girl)\b|\b(?:[0-9]|1[0-8])[- ]year[- ]old\b/i.test(text);
}

export function canonicalUrl(value) {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return "";
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return ""; }
}

function dateMs(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return NaN;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return NaN;
  return Date.parse(value);
}

export function validateCandidate(type, item, now = new Date()) {
  if (!TABLES[type]) return "Unknown content type";
  if (!item || typeof item.title !== "string" || !item.title.trim()) return "Missing title";
  if (type === "news" && needsEditorialReview(item)) return "Requires editorial review before publication";
  if (!canonicalUrl(item.sourceUrl)) return "Missing canonical source URL";
  if (!item.sourceName || !item.evidence) return "Missing source evidence";
  const checked = dateMs(item.evidence.checkedAt || item.checkedAt);
  if (!Number.isFinite(checked) || checked > +now + 300000 || checked < +now - DAY * 1.5) return "Source verification is stale";
  const published = dateMs(item.publishedAt);
  if (type === "news" || type === "jobs") {
    if (!Number.isFinite(published) || published > +now) return "Missing or future original publication date";
    if (published < +now - DAY * (type === "jobs" ? 30 : 3)) return "Original publication date is too old";
  }
  if (type === "jobs") {
    if (item.status !== "open" || item.evidence.activeListing !== true) return "Vacancy is not verified open";
    if (!(item.company || item.employer) || !canonicalUrl(item.applicationUrl || item.applyUrl || item.sourceUrl)) return "Missing employer/application destination";
    if (item.expiresAt != null && (!Number.isFinite(dateMs(item.expiresAt)) || dateMs(item.expiresAt) <= +now)) return "Vacancy has closed or invalid expiry";
  }
  if (type === "events") {
    const start = dateMs(item.startAt || item.startsAt);
    const end = dateMs(item.endAt || item.expiresAt);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || end <= +now) return "Event has ended or dates are unverified";
    if (item.status === "cancelled" || item.status === "postponed") return "Event cancelled or postponed";
    if (!item.location) return "Missing event location";
  }
  return null;
}

export function contentHash(type, item) {
  const occurrence = type === "events" ? item.startAt || item.startsAt : type === "jobs" ? item.publishedAt : "";
  return crypto.createHash("sha256").update(`${canonicalUrl(item.sourceUrl)}${occurrence ? `|${occurrence}` : ""}`).digest("hex");
}

function words(title) {
  const stop = new Set(["the", "a", "an", "to", "of", "in", "on", "and", "for", "at", "with", "is", "as", "by", "from", "darwin", "nt", "northern", "territory"]);
  return new Set(String(title).normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").split(/\s+/).filter(word => word.length > 1 && !stop.has(word)));
}

export function sameStory(a, b) {
  const left = words(a), right = words(b);
  if (!left.size || !right.size) return false;
  const common = [...left].filter(word => right.has(word)).length;
  if (common === left.size && common === right.size) return true;
  return common >= 4 && common / new Set([...left, ...right]).size >= 0.72;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function metadata(type, item, now) {
  const value = {
    version: 1, type, sourcePublishedAt: item.publishedAt || null,
    expiresAt: item.expiresAt || item.endAt || null,
    sourceUrl: canonicalUrl(item.sourceUrl), verifiedAt: item.evidence.checkedAt || item.checkedAt || null
  };
  return `${METADATA_PREFIX}${JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e")} -->\n`;
}

function sourceText(item) {
  return [String(item.excerpt || "").trim(), `来源 / Source：${item.sourceName}`, canonicalUrl(item.sourceUrl)].filter(Boolean).join("\n\n");
}

export function buildPayload(type, item, now = new Date()) {
  const title = item.title.trim().slice(0, 250);
  const source = canonicalUrl(item.sourceUrl);
  const base = { title, source_url: source, source_hash: contentHash(type, item), ai_generated: false };
  if (type === "news") {
    const body = [sourceText(item), `原文发布时间 / Source published：${item.publishedAt}`, "简讯与来源链接；完整信息请查看原文。"].join("\n\n");
    return {
      ...base, slug: `news-${base.source_hash.slice(0, 24)}`, summary: String(item.excerpt || "查看来源了解完整信息。"),
      content: body, body,
      html_body: `<p>${escapeHtml(item.excerpt || "请查看来源了解完整信息。")}</p><p>来源：${escapeHtml(item.sourceName)}</p><p>原文发布时间：${escapeHtml(item.publishedAt)}</p><p><a href="${escapeHtml(source)}" target="_blank" rel="noopener noreferrer">查看原文 / Read source</a></p>`,
      category: item.category || "local", author: "DarwinBBS 来源简讯", published: true,
      featured: false, views: 0, likes: 0, comments_count: 0,
      created_at: item.publishedAt, updated_at: now.toISOString(),
      image_url: null, cover_image: null, cover_images: []
    };
  }
  if (type === "jobs") {
    return {
      ...base, company: item.company || item.employer, contact: canonicalUrl(item.applicationUrl || item.applyUrl || source),
      content: metadata(type, item, now) + [sourceText(item), `地点 / Location：${item.location || "详见招聘方页面"}`, `原始发布日期：${item.publishedAt}`, item.expiresAt ? `截止日期：${item.expiresAt}` : "招聘方未公布截止日期；以申请页面为准。", `核验时间：${item.evidence.checkedAt || item.checkedAt}`, "通过招聘方页面申请，请勿向陌生人支付招聘费用。"].join("\n\n"),
      images: [], views: 0, likes: 0, comments_count: 0, created_at: item.publishedAt
    };
  }
  const startAt = item.startAt || item.startsAt;
  const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Darwin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(startAt));
  return {
    ...base, summary: String(item.excerpt || "活动详情请查看主办方页面。"),
    description: metadata(type, item, now) + [sourceText(item), `开始：${startAt}`, `结束：${item.endAt || item.expiresAt}`, "时间及安排以主办方最新公告为准。"].join("\n\n"),
    event_date: localDate, starts_at: startAt, location: item.location,
    price: item.price || "详见主办方页面", price_label: item.price || "详见主办方页面",
    category: item.category || "community", tags: item.category || "community",
    created_at: now.toISOString(), updated_at: now.toISOString()
  };
}

function check(result, action) {
  if (result?.error) throw new Error(`${action}: ${result.error.message || "database error"}`);
  return result?.data;
}

export async function publishItems({ supabase, type, items, limit, now = new Date(), dryRun = false }) {
  const stats = { inserted: 0, refreshed: 0, duplicates: 0, rejected: 0, capped: 0, pending: 0, reasons: {}, items: [] };
  const valid = [];
  const seen = new Set();
  for (const item of items) {
    const reason = validateCandidate(type, item, now);
    if (reason) { stats.rejected++; stats.reasons[reason] = (stats.reasons[reason] || 0) + 1; continue; }
    const hash = contentHash(type, item);
    if (seen.has(hash)) { stats.duplicates++; continue; }
    seen.add(hash); valid.push({ item, hash });
  }
  if (!valid.length) return stats;
  // Fail closed when tracking is unavailable. Never publish without dedup state.
  const history = check(await supabase.from("auto_posts").select("source_hash,source_title,target_table,target_id,posted_at").eq("type", type).order("posted_at", { ascending: false }).limit(1000), "Read publication history") || [];
  const known = new Map(history.map(row => [row.source_hash, row]));
  // Hash lookup also covers older records outside the recent title window.
  const exact = check(await supabase.from("auto_posts").select("source_hash,source_title,target_table,target_id,posted_at").eq("type", type).in("source_hash", valid.map(v => v.hash)), "Read existing source keys") || [];
  exact.forEach(row => known.set(row.source_hash, row));
  for (const { item, hash } of valid) {
    const existing = known.get(hash);
    const payload = buildPayload(type, item, now);
    if (existing) {
      if (String(existing.target_id).startsWith("pending:")) { stats.pending++; continue; }
      if (["jobs", "events"].includes(type) && existing.target_table === TABLES[type] && /^[a-zA-Z0-9-]{1,80}$/.test(existing.target_id || "")) {
        if (!dryRun) {
          const { views, likes, comments_count, created_at, ...refresh } = payload;
          const updated = check(await supabase.from(TABLES[type]).update(refresh).eq("id", existing.target_id).eq("source_hash", hash).select("id"), "Refresh verified listing");
          if (!updated?.length) { stats.duplicates++; continue; }
        }
        stats.refreshed++;
      } else stats.duplicates++;
      continue;
    }
    if (type === "news" && history.some(row => Date.parse(row.posted_at) > +now - 7 * DAY && sameStory(row.source_title, item.title))) { stats.duplicates++; continue; }
    if (stats.inserted >= limit) { stats.capped++; continue; }
    if (dryRun) { stats.inserted++; stats.items.push({ title: payload.title, source_url: payload.source_url }); history.push({ source_title: item.title, posted_at: now.toISOString() }); continue; }
    const reservation = `pending:${crypto.randomUUID()}`;
    const claim = await supabase.from("auto_posts").insert({ type, source_url: payload.source_url, source_hash: hash, source_title: item.title, target_table: TABLES[type], target_id: reservation, posted_at: now.toISOString() });
    if (claim.error?.code === "23505") { stats.duplicates++; continue; }
    check(claim, "Reserve unique source");
    const inserted = await supabase.from(TABLES[type]).insert(payload).select("id,title").single();
    if (inserted.error) {
      // Keep the reservation on uncertain failures. A timeout can occur after the DB commits.
      // Operators reconcile this source_hash; automatic retries must not create duplicates.
      throw new Error(`Publish failed; source ${hash.slice(0, 12)} reserved for reconciliation: ${inserted.error.message}`);
    }
    const finalized = check(await supabase.from("auto_posts").update({ target_id: String(inserted.data.id) }).eq("type", type).eq("source_hash", hash).eq("target_id", reservation).select("target_id"), "Finalize source reservation");
    if (!finalized?.length) throw new Error(`Published source ${hash.slice(0, 12)} requires reservation reconciliation`);
    known.set(hash, { source_hash: hash, source_title: item.title, target_table: TABLES[type], target_id: String(inserted.data.id), posted_at: now.toISOString() });
    history.push({ source_title: item.title, posted_at: now.toISOString() });
    stats.inserted++; stats.items.push(inserted.data);
  }
  return stats;
}
