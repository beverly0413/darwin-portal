import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { buildPayload } from "../api/_content-pipeline.js";

const NOW = Date.parse("2026-09-30T15:00:00Z"); // Already 1 October in Darwin.
class FixedDate extends Date {
  constructor(...args) { super(...(args.length ? args : [NOW])); }
  static now() { return NOW; }
}

function element(tagName = "div") {
  return {
    tagName, children: [], attributes: {}, style: {}, dataset: {}, listeners: {},
    textContent: "", hidden: false, disabled: false,
    set innerHTML(value) { this.html = value; this.children = []; },
    get innerHTML() { return this.html || ""; },
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    classList: { add() {}, remove() {} },
  };
}

function browser(script, client) {
  const nodes = Object.fromEntries([
    "eventsGrid", "eventsStatus", "eventsRetry", "jobList", "jobsListStatus", "jobsRetry",
  ].map((id) => [id, element()]));
  const document = {
    getElementById: (id) => nodes[id] || null,
    querySelectorAll: () => [],
    createElement: element,
    addEventListener() {},
  };
  const context = vm.createContext({
    document, window: { supabaseClient: client, location: { search: "" } },
    console: { error() {} }, URL, URLSearchParams, Intl, Date: FixedDate, setTimeout,
  });
  vm.runInContext(readFileSync(new URL(`../${script}`, import.meta.url), "utf8"), context);
  return { context, nodes };
}

function metadata(type, overrides = {}, text = "真实来源内容") {
  return `<!--darwinbbs:metadata ${JSON.stringify({
    version: 1, type, sourcePublishedAt: "2026-09-29T01:00:00Z", expiresAt: null,
    sourceUrl: "https://example.com/listing", verifiedAt: "2026-09-30T14:00:00Z", ...overrides,
  })} -->\n${text}`;
}

function eventClient(response) {
  const selected = [];
  const ranges = [];
  const builder = {
    select(fields) { selected.push(fields); return this; },
    order() { return this; },
    range(start, end) { ranges.push([start, end]); return typeof response === "function" ? response(start) : Promise.resolve(response); },
  };
  return { client: { from(table) { assert.equal(table, "events"); return builder; } }, selected, ranges };
}

function jobClient(response) {
  const selected = [];
  const builder = { select(fields) { selected.push(fields); return this; }, order() { return typeof response === "function" ? response() : Promise.resolve(response); } };
  return { selected, from(table) { assert.equal(table, "jobs_posts"); return builder; } };
}

test("events uses only schema-backed source_url and renders real records", async () => {
  const fixture = eventClient({ data: [{ title: "Source event", event_date: "2026-10-02", source_url: "https://example.com/event" }], error: null });
  const { context, nodes } = browser("events.js", fixture.client);
  await context.loadEvents();
  assert.ok(fixture.selected[0].split(", ").includes("source_url"));
  assert.ok(!fixture.selected[0].split(", ").includes("url"));
  assert.equal(nodes.eventsGrid.children.length, 1);
  assert.equal(nodes.eventsGrid.children[0].href, "https://example.com/event");
  assert.equal(nodes.eventsGrid.children[0].rel, "noopener noreferrer");
  assert.match(nodes.eventsGrid.children[0].innerHTML, /Source event/);
});

test("missing service and database errors are honest and survive filtering", async () => {
  for (const client of [undefined, eventClient({ data: null, error: new Error("column missing") }).client]) {
    const { context, nodes } = browser("events.js", client);
    await context.loadEvents();
    const message = nodes.eventsStatus.textContent;
    assert.match(message, /无法加载/);
    assert.equal(nodes.eventsGrid.children.length, 0);
    assert.equal(nodes.eventsRetry.hidden, false);
    assert.equal(nodes.eventsRetry.disabled, false);
    vm.runInContext('searchTerm = "market"; activeFilter = "free"; renderEvents();', context);
    assert.equal(nodes.eventsStatus.textContent, message);
    assert.doesNotMatch(message, /数据库还未启用|推荐活动样例/);
  }
});

test("event network rejection and empty database are distinct states", async () => {
  const failed = browser("events.js", eventClient(() => Promise.reject(new Error("network"))).client);
  await failed.context.loadEvents();
  assert.match(failed.nodes.eventsStatus.textContent, /无法加载/);
  const empty = browser("events.js", eventClient({ data: [], error: null }).client);
  await empty.context.loadEvents();
  assert.match(empty.nodes.eventsStatus.textContent, /暂无活动记录/);
  assert.equal(empty.nodes.eventsGrid.children.length, 0);
});

test("retry clears errors and superseded event requests cannot overwrite newer results", async () => {
  let resolveOld;
  let calls = 0;
  const fixture = eventClient(() => ++calls === 1 ? new Promise((resolve) => { resolveOld = resolve; }) :
    Promise.resolve({ data: [{ title: "New", event_date: "2026-10-02" }], error: null }));
  const { context, nodes } = browser("events.js", fixture.client);
  const old = context.loadEvents();
  await context.loadEvents();
  resolveOld({ data: null, error: new Error("stale error") });
  await old;
  assert.equal(nodes.eventsGrid.children.length, 1);
  assert.match(nodes.eventsGrid.children[0].innerHTML, /New/);
  assert.doesNotMatch(nodes.eventsStatus.textContent, /无法加载/);
});

test("event pagination does not let the first page hide later current rows", async () => {
  const fixture = eventClient((start) => Promise.resolve({ data: start === 0 ?
    Array.from({ length: 500 }, () => ({ title: "Past", event_date: "2026-09-01" })) :
    [{ title: "Upcoming", event_date: "2026-10-02" }], error: null }));
  const { context, nodes } = browser("events.js", fixture.client);
  await context.loadEvents();
  assert.equal(fixture.ranges.length, 2);
  assert.equal(nodes.eventsGrid.children.length, 1);
  assert.match(nodes.eventsGrid.children[0].innerHTML, /Upcoming/);
});

test("events filter by Darwin calendar dates across UTC midnight", () => {
  const { context } = browser("events.js");
  assert.equal(context.darwinEventDay(NOW), "2026-10-01");
  assert.equal(context.normalizeEvent({ event_date: "2026-09-30" }, NOW), null);
  assert.ok(context.normalizeEvent({ event_date: "2026-10-01" }, NOW));
  assert.equal(context.normalizeEvent({ starts_at: "2026-09-30T14:00:00Z" }, NOW), null);
  assert.ok(context.normalizeEvent({ starts_at: "2026-09-30T15:00:00Z" }, NOW));
  assert.match(context.formatEventDate("2026-10-01"), /2026/);
});

test("unknown and invalid legacy event dates are never called current", async () => {
  const fixture = eventClient({ data: [{ title: "Unknown", event_date: "2026-02-30", source_url: "https://example.com" }], error: null });
  const { context, nodes } = browser("events.js", fixture.client);
  await context.loadEvents();
  assert.match(nodes.eventsStatus.textContent, /不能视为近期活动/);
  assert.match(nodes.eventsGrid.children[0].innerHTML, /日期待确认/);
  assert.equal(context.normalizeEvent({ event_date: "next weekend" }).dateConfirmed, false);
});

test("event metadata is stripped, expiry applied, malformed automated records hidden", () => {
  const { context } = browser("events.js");
  const row = { event_date: "2026-10-02", description: metadata("events") };
  assert.equal(context.normalizeEvent(row, NOW).summary, "真实来源内容");
  assert.equal(context.normalizeEvent({ ...row, description: metadata("events", { expiresAt: "2026-09-30T15:00:00Z" }) }, NOW), null);
  assert.equal(context.normalizeEvent({ ...row, description: "<!--darwinbbs:metadata {bad} -->\nHidden" }, NOW), null);
  assert.equal(context.normalizeEvent({ ...row, description: metadata("jobs") }, NOW), null);
  assert.equal(context.normalizeEvent({ description: metadata("events") }, NOW), null);
  assert.ok(context.normalizeEvent({ event_date: "2026-09-20", description: metadata("events", { expiresAt: "2026-10-02T00:00:00Z" }) }, NOW));
});

test("event cards reject unsafe links and escape source content", async () => {
  const fixture = eventClient({ data: [{ title: '<img onerror="boom">', summary: "<script>bad</script>", event_date: "2026-10-02", source_url: "javascript:alert(1)" }], error: null });
  const { context, nodes } = browser("events.js", fixture.client);
  await context.loadEvents();
  const card = nodes.eventsGrid.children[0];
  assert.equal(card.tagName, "article");
  assert.match(card.innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(card.innerHTML, /<img|<script/);
  for (const value of ["javascript:alert(1)", "data:text/html,hello", "//example.com", "https://user:password@example.com", "https://example.com\n"]) {
    assert.equal(context.safeEventUrl(value), "");
  }
});

test("legacy community jobs keep content and get an honest post date", () => {
  const { context } = browser("jobs.js");
  const row = { id: 1, content: "Local user post", created_at: "2020-01-02T00:00:00Z" };
  const job = context.normalizeJobForDisplay(row, NOW);
  assert.equal(job.content, row.content);
  assert.equal(job.sourceMetadata, null);
  assert.match(context.jobDateLabel(job), /^社区帖子发布于：2020-01-02/);
  assert.equal(context.jobDateLabel({}), "社区帖子发布日期未提供");
});

test("automated jobs display original publication instead of ingestion date", async () => {
  const row = { id: 1, title: "Real vacancy", created_at: "2026-09-30T14:00:00Z", content: metadata("jobs", {}, "Description") };
  const { context, nodes } = browser("jobs.js", jobClient({ data: [row], error: null }));
  await context.loadJobs();
  assert.equal(nodes.jobList.children.length, 1);
  assert.match(nodes.jobList.children[0].innerHTML, /来源发布于：2026-09-29/);
  assert.match(nodes.jobList.children[0].innerHTML, /Description/);
  assert.doesNotMatch(nodes.jobList.children[0].innerHTML, /darwinbbs:metadata|2026-09-30/);
});

test("automated jobs reject invalid, old, future, expired, and stale metadata", () => {
  const { context } = browser("jobs.js");
  const invalid = [
    { sourcePublishedAt: "2026-08-01T00:00:00Z" },
    { sourcePublishedAt: "2026-10-01T00:00:00Z" },
    { sourcePublishedAt: "2026-02-30T00:00:00Z" },
    { sourcePublishedAt: "yesterday" },
    { sourcePublishedAt: null },
    { verifiedAt: "2026-09-28T00:00:00Z" },
    { verifiedAt: "2026-09-30T15:06:00Z" },
    { verifiedAt: null },
    { expiresAt: "2026-09-30T15:00:00Z" },
    { expiresAt: "next week" },
    { sourceUrl: "javascript:alert(1)" },
    { version: 2 },
    { type: "events" },
  ];
  for (const change of invalid) {
    assert.equal(context.normalizeJobForDisplay({ content: metadata("jobs", change) }, NOW), null, JSON.stringify(change));
  }
  assert.equal(context.normalizeJobForDisplay({ content: "<!--darwinbbs:metadata nope -->" }, NOW), null);
});

test("active source jobs may have no expiry but must meet verification freshness boundary", () => {
  const { context } = browser("jobs.js");
  assert.ok(context.normalizeJobForDisplay({ content: metadata("jobs", { expiresAt: null }) }, NOW));
  assert.ok(context.normalizeJobForDisplay({ content: metadata("jobs", { verifiedAt: "2026-09-29T03:00:00Z" }) }, NOW));
  assert.equal(context.normalizeJobForDisplay({ content: metadata("jobs", { verifiedAt: "2026-09-29T02:59:59Z" }) }, NOW), null);
  assert.ok(context.normalizeJobForDisplay({ content: metadata("jobs", { verifiedAt: "2026-09-30T15:05:00Z" }) }, NOW));
});

test("job service failure has retry and no stale cached list", async () => {
  const { context, nodes } = browser("jobs.js", jobClient({ data: null, error: new Error("unavailable") }));
  await context.loadJobs();
  assert.match(nodes.jobsListStatus.textContent, /无法加载/);
  assert.equal(nodes.jobsRetry.disabled, false);
  assert.equal(nodes.jobsRetry.textContent, "重试");
  assert.equal(nodes.jobList.children.length, 0);
  context.window.supabaseClient = jobClient({ data: [{ id: 1, title: "Recovered", content: "User post" }], error: null });
  await context.loadJobs();
  assert.equal(nodes.jobList.children.length, 1);
  assert.doesNotMatch(nodes.jobsListStatus.textContent, /无法加载/);
});

test("all expired imported jobs produce an honest empty state", async () => {
  const { context, nodes } = browser("jobs.js", jobClient({ data: [{ content: metadata("jobs", { verifiedAt: "2026-09-20T00:00:00Z" }) }], error: null }));
  await context.loadJobs();
  assert.equal(nodes.jobList.children.length, 0);
  assert.match(nodes.jobsListStatus.textContent, /已过期、来源状态未及时更新/);
});

test("public HTML exposes status/retry and no unverified current-events claim", () => {
  const events = readFileSync(new URL("../events.html", import.meta.url), "utf8");
  const jobs = readFileSync(new URL("../jobs.html", import.meta.url), "utf8");
  assert.match(events, /id="eventsRetry"/);
  assert.match(events, /id="eventsStatus" role="status"/);
  assert.doesNotMatch(events, /近期推荐|全网活动事项/);
  assert.match(jobs, /id="jobsRetry"/);
  assert.match(jobs, /id="jobsListStatus" role="status"/);
});


test("frontend accepts real automation event/job payloads without inventing event publication dates", () => {
  const { context: events } = browser("events.js");
  const { context: jobs } = browser("jobs.js");
  const base = {
    title: "Source item", sourceUrl: "https://example.com/source", sourceName: "Source",
    location: "Darwin", excerpt: "Original excerpt", evidence: { checkedAt: new Date(NOW).toISOString() },
  };
  const event = buildPayload("events", {
    ...base, publishedAt: null, startAt: "2026-10-02T09:00:00+09:30", endAt: "2026-10-02T12:00:00+09:30",
  }, new Date(NOW));
  assert.ok(events.normalizeEvent(event, NOW));
  const job = buildPayload("jobs", { ...base, company: "Employer", publishedAt: "2026-09-29T00:00:00Z" }, new Date(NOW));
  assert.ok(jobs.normalizeJobForDisplay(job, NOW));
});


test("automated events require verification within 36 hours with five-minute clock tolerance", () => {
  const { context } = browser("events.js");
  const row = { event_date: "2026-10-02", description: metadata("events") };
  assert.ok(context.normalizeEvent({ ...row, description: metadata("events", { verifiedAt: "2026-09-29T03:00:00Z" }) }, NOW));
  assert.equal(context.normalizeEvent({ ...row, description: metadata("events", { verifiedAt: "2026-09-29T02:59:59Z" }) }, NOW), null);
  assert.ok(context.normalizeEvent({ ...row, description: metadata("events", { verifiedAt: "2026-09-30T15:05:00Z" }) }, NOW));
  assert.equal(context.normalizeEvent({ ...row, description: metadata("events", { verifiedAt: "2026-09-30T15:05:01Z" }) }, NOW), null);
  assert.equal(context.normalizeEvent({ ...row, description: metadata("events", { verifiedAt: "2026-09-20T00:00:00Z" }) }, NOW), null);
});

test("event verification age never hides undated or upcoming legacy community records", () => {
  const { context } = browser("events.js");
  assert.ok(context.normalizeEvent({ event_date: "2026-10-02", description: "Community event", created_at: "2020-01-01T00:00:00Z" }, NOW));
  assert.equal(context.normalizeEvent({ description: "Confirm with organizer", created_at: "2020-01-01T00:00:00Z" }, NOW).dateConfirmed, false);
});

test("all stale imported events produce an honest empty state", async () => {
  const fixture = eventClient({ data: [{ event_date: "2026-10-02", description: metadata("events", { verifiedAt: "2026-09-20T00:00:00Z" }) }], error: null });
  const { context, nodes } = browser("events.js", fixture.client);
  await context.loadEvents();
  assert.equal(nodes.eventsGrid.children.length, 0);
  assert.match(nodes.eventsStatus.textContent, /未能及时更新来源状态/);
});


test("legacy AI hiring-news imports are hidden rather than relabeled as manual vacancies", async () => {
  const response = { data: [
    { id: 1, title: "Old generated hiring news", content: "Unverified hiring news", ai_generated: true, source_url: "https://example.com/news" },
    { id: 2, title: "Community vacancy", content: "Please contact me", ai_generated: false, created_at: "2026-09-29T00:00:00Z" },
  ], error: null };
  const client = jobClient(response);
  const { context, nodes } = browser("jobs.js", client);
  await context.loadJobs();
  assert.ok(client.selected[0].split(", ").includes("ai_generated"));
  assert.ok(client.selected[0].split(", ").includes("source_url"));
  assert.equal(nodes.jobList.children.length, 1);
  assert.match(nodes.jobList.children[0].innerHTML, /Community vacancy/);
  assert.match(nodes.jobList.children[0].innerHTML, /社区帖子发布于/);
  assert.match(nodes.jobList.children[0].innerHTML, /招聘状态待确认/);
  assert.equal(response.data.length, 2); // Filtering must not delete persisted input records.
  assert.equal(context.normalizeJobForDisplay({ ai_generated: true, content: "Old summary" }, NOW), null);
  assert.ok(context.normalizeJobForDisplay({ ai_generated: false, content: "Manual post" }, NOW));
  assert.ok(context.normalizeJobForDisplay({ content: "Legacy manual post without explicit flag" }, NOW));
});

test("valid new metadata controls freshness even if an existing job retains the AI flag", () => {
  const { context } = browser("jobs.js");
  assert.ok(context.normalizeJobForDisplay({ ai_generated: true, content: metadata("jobs") }, NOW));
  assert.equal(context.normalizeJobForDisplay({ ai_generated: true, content: metadata("jobs", { verifiedAt: "2026-09-20T00:00:00Z" }) }, NOW), null);
  assert.equal(context.normalizeJobForDisplay({ ai_generated: true, content: "<!--darwinbbs:metadata invalid -->" }, NOW), null);
});
