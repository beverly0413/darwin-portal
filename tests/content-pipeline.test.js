import test from "node:test";
import assert from "node:assert/strict";
import { canonicalUrl, contentHash, validateCandidate, sameStory, buildPayload, publishItems } from "../api/_content-pipeline.js";
import { memoryDb } from "./helpers/memory-db.js";

const now = new Date("2026-09-30T07:00:00Z");
const news = { title: "Council opens new library", excerpt: "The library opens this week.", sourceUrl: "https://example.org/news/library", sourceName: "Council", publishedAt: "2026-09-29T00:00:00Z", evidence: { checkedAt: now.toISOString() } };
const job = { ...news, title: "Head Chef", sourceUrl: "https://jobs.example.org/123", publishedAt: "2026-09-05T01:00:00Z", employer: "Employer", applyUrl: "https://jobs.example.org/123", status: "open", location: "Darwin, NT", expiresAt: null, evidence: { activeListing: true, checkedAt: now.toISOString() } };
const event = { ...news, title: "Community music", sourceUrl: "https://example.org/event/music", publishedAt: null, startAt: "2026-09-30T10:00:00+09:30", endAt: "2026-09-30T20:00:00+09:30", status: "ongoing", location: "Darwin, NT" };

test("canonical URLs retain meaningful query IDs but strip tracking and fragments", () => {
  assert.equal(canonicalUrl("https://example.org/a?id=3&utm_source=x#top"), "https://example.org/a?id=3");
  assert.equal(canonicalUrl("javascript:alert(1)"), "");
  assert.equal(canonicalUrl("https://secret@example.org/"), "");
});
test("vacancies require original recent dates and affirmative active source evidence", () => {
  assert.equal(validateCandidate("jobs", job, now), null);
  assert.match(validateCandidate("jobs", { ...job, publishedAt: "2026-08-01T00:00:00Z" }, now), /too old/);
  assert.match(validateCandidate("jobs", { ...job, publishedAt: null }, now), /publication date/);
  assert.match(validateCandidate("jobs", { ...job, evidence: { checkedAt: now.toISOString() } }, now), /verified open/);
  assert.match(validateCandidate("jobs", { ...job, expiresAt: "2026-09-30T06:00:00Z" }, now), /closed/);
  assert.match(validateCandidate("jobs", { ...job, evidence: { activeListing: true, checkedAt: "2026-09-28T00:00:00Z" } }, now), /stale/);
  assert.match(validateCandidate("jobs", { ...job, publishedAt: "2026-09-30T07:01:00Z" }, now), /future/);
  assert.match(validateCandidate("jobs", { ...job, publishedAt: "2026-09-31T00:00:00Z" }, now), /publication date/);
});
test("metadata retains the evidence timestamp without extending freshness", () => {
  const checkedAt = "2026-09-29T09:00:00Z";
  const item = { ...job, checkedAt, evidence: { activeListing: true } };
  assert.equal(validateCandidate("jobs", item, now), null);
  assert.ok(buildPayload("jobs", item, now).content.includes(`"verifiedAt":"${checkedAt}"`));
});
test("events need actual nonexpired start/end and no cancelled status", () => {
  assert.equal(validateCandidate("events", event, now), null);
  assert.match(validateCandidate("events", { ...event, endAt: null }, now), /dates/);
  assert.match(validateCandidate("events", { ...event, status: "cancelled" }, now), /cancelled/);
  assert.match(validateCandidate("events", { ...event, endAt: "2026-09-30T06:00:00Z" }, now), /ended/);
});
test("news has a three-day source publication window", () => {
  assert.equal(validateCandidate("news", news, now), null);
  assert.match(validateCandidate("news", { ...news, publishedAt: "2026-09-25T00:00:00Z" }, now), /too old/);
});
test("high-impact personal allegations are held for editorial review", () => {
  assert.match(validateCandidate("news", { ...news, title: "Named official faces assault charges" }, now), /editorial review/);
  assert.match(validateCandidate("news", { ...news, title: "A named 16-year-old receives local award" }, now), /editorial review/);
  assert.equal(validateCandidate("news", { ...news, title: "Government announces changes to disability service rules" }, now), null);
});
test("source identity permits genuinely new event occurrences and job reposts", () => {
  assert.equal(contentHash("news", news), contentHash("news", { ...news, sourceUrl: `${news.sourceUrl}?utm_campaign=test` }));
  assert.notEqual(contentHash("events", event), contentHash("events", { ...event, startAt: "2026-10-10T00:00:00Z" }));
  assert.notEqual(contentHash("jobs", job), contentHash("jobs", { ...job, publishedAt: "2026-09-15T00:00:00Z" }));
});
test("similar titles are deduplicated without conflating different stories", () => {
  assert.equal(sameStory("Larrakia cultural centre opens in Darwin today", "Darwin Larrakia cultural centre opens today"), true);
  assert.equal(sameStory("Darwin council library opens", "Darwin hospital emergency closes"), false);
});
test("payload preserves original job date and metadata; events use Darwin calendar day", () => {
  const payload = buildPayload("jobs", job, now);
  assert.equal(payload.company, "Employer");
  assert.equal(payload.created_at, job.publishedAt);
  assert.ok(payload.content.startsWith("<!--darwinbbs:metadata "));
  assert.match(payload.content, /sourcePublishedAt/);
  const result = buildPayload("events", { ...event, startAt: "2026-09-30T16:00:00Z", endAt: "2026-09-30T18:00:00Z" }, now);
  assert.equal(result.event_date, "2026-10-01");
});
test("source content and source URL cannot inject HTML", () => {
  const payload = buildPayload("news", { ...news, excerpt: '<script>alert("bad")</script>' }, now);
  assert.ok(!payload.html_body.includes("<script>"));
  assert.match(payload.html_body, /&lt;script&gt;/);
  assert.equal(payload.ai_generated, false);
  assert.equal(payload.image_url, null);
});
test("repeated updates insert news only once and refresh an active job in-place", async () => {
  const db = memoryDb();
  assert.equal((await publishItems({ supabase: db, type: "news", items: [news, news], limit: 3, now })).inserted, 1);
  assert.equal((await publishItems({ supabase: db, type: "news", items: [news], limit: 3, now })).duplicates, 1);
  await publishItems({ supabase: db, type: "jobs", items: [job], limit: 5, now });
  db.tables.jobs_posts[0].likes = 7;
  const result = await publishItems({ supabase: db, type: "jobs", items: [job], limit: 5, now });
  assert.equal(result.refreshed, 1); assert.equal(db.tables.jobs_posts.length, 1);
  assert.equal(db.tables.jobs_posts[0].likes, 7);
  assert.equal(db.tables.jobs_posts[0].created_at, job.publishedAt);
});
test("failed history lookup stops all mutations", async () => {
  const db = memoryDb({}, q => q.table === "auto_posts" && q.operation === "select" ? { message: "missing table" } : null);
  await assert.rejects(publishItems({ supabase: db, type: "news", items: [news], limit: 3, now }), /history/);
  assert.ok(db.calls.every(call => call.operation === "select"));
});
test("uncertain insert failure retains reservation to prevent duplicate retries", async () => {
  const db = memoryDb({}, q => q.table === "news" && q.operation === "insert" ? { message: "timeout" } : null);
  await assert.rejects(publishItems({ supabase: db, type: "news", items: [news], limit: 3, now }), /reserved for reconciliation/);
  assert.match(db.tables.auto_posts[0].target_id, /^pending:/);
  const retry = await publishItems({ supabase: db, type: "news", items: [news], limit: 3, now });
  assert.equal(retry.pending, 1); assert.equal(retry.inserted, 0);
});
test("dry run checks real history but cannot mutate any table", async () => {
  const db = memoryDb();
  const result = await publishItems({ supabase: db, type: "news", items: [news], limit: 3, now, dryRun: true });
  assert.equal(result.inserted, 1);
  assert.ok(db.calls.every(call => call.operation === "select"));
});
test("dry-run and real execution share in-batch same-story dedup behavior", async () => {
  const items = [news, { ...news, sourceUrl: "https://example.org/other-report" }];
  const simulated = await publishItems({ supabase: memoryDb(), type: "news", items, limit: 3, now, dryRun: true });
  const actual = await publishItems({ supabase: memoryDb(), type: "news", items, limit: 3, now });
  assert.equal(simulated.inserted, 1); assert.equal(actual.inserted, 1);
  assert.equal(simulated.duplicates, actual.duplicates);
});
test("zero-row reservation finalization is not reported as success", async () => {
  const db = memoryDb(), original = db.from.bind(db);
  db.from = table => {
    const builder = original(table), update = builder.update;
    if (table === "auto_posts") builder.update = values => { update(values); builder.select = () => Promise.resolve({ data: [], error: null }); return builder; };
    return builder;
  };
  await assert.rejects(publishItems({ supabase: db, type: "news", items: [news], limit: 3, now }), /requires reservation reconciliation/);
});
test("simultaneous source reservations enforce exact-source uniqueness", async () => {
  const db = memoryDb();
  const results = await Promise.all([1, 2].map(() => publishItems({ supabase: db, type: "news", items: [news], limit: 3, now })));
  assert.equal(results.reduce((n, result) => n + result.inserted, 0), 1);
  assert.equal(db.tables.news.length, 1);
});
