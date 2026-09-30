import test from "node:test";
import assert from "node:assert/strict";
import { requireAutomationAuth } from "../api/_auto-utils.js";
import { createAutomationHandler, parseOptions, acquireRunLock } from "../api/_automation-handler.js";
import { memoryDb } from "./helpers/memory-db.js";
import { collectVerifiedContent } from "../api/_content-sources.js";
const now = new Date("2026-09-30T07:00:00Z");
function response() { return { code: null, body: null, headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } }; }
const request = { method: "GET", headers: {} };

test("automation authentication fails closed and ignores spoofable/query headers", () => {
  assert.throws(() => requireAutomationAuth({ headers: {} }, {}), /not configured/);
  for (const req of [{ headers: {} }, { headers: { "x-vercel-cron": "1", "user-agent": "vercel-cron" } }, { headers: {}, query: { key: "cron-test-secret" } }, { headers: { authorization: "Bearer wrong" } }]) {
    assert.throws(() => requireAutomationAuth(req, { CRON_SECRET: "cron-test-secret" }), /Unauthorized/);
  }
});
test("independent cron and existing automation keys work without precedence conflict", () => {
  const env = { CRON_SECRET: "cron-test-secret", AUTO_POST_KEY: "manual-test-secret" };
  assert.equal(requireAutomationAuth({ headers: { authorization: "Bearer cron-test-secret" } }, env), true);
  assert.equal(requireAutomationAuth({ headers: { "x-auto-post-key": "manual-test-secret" } }, env), true);
});
test("limit rejects NaN, fractions, zero and excessive values", () => {
  for (const limit of ["no", 0, -1, 1.5, 100, "Infinity"]) assert.throws(() => parseOptions({ query: { limit } }, "news"), /integer/);
  assert.equal(parseOptions({ query: { limit: "2", dryRun: "true" } }, "news").dryRun, true);
});
test("failed authorization does not create a privileged client or write logs", async () => {
  let touched = false;
  const handler = createAutomationHandler("news", { auth: () => { throw Object.assign(new Error("Unauthorized"), { statusCode: 401 }); }, getDb: () => { touched = true; } });
  const res = response(); await handler(request, res);
  assert.equal(res.code, 401); assert.equal(touched, false);
});
test("dry-run has no lock, logs or publishing writes", async () => {
  const db = memoryDb(); let passed;
  const handler = createAutomationHandler("news", { auth() {}, getDb: () => db, now: () => now, lock() { throw new Error("must not lock"); }, collect: async () => ({ news: [], diagnostics: [] }), publish: async args => { passed = args; return { inserted: 0, refreshed: 0, rejected: 0 }; } });
  const res = response(); await handler({ ...request, query: { dryRun: "true" } }, res);
  assert.equal(res.code, 200); assert.equal(passed.dryRun, true); assert.equal(db.calls.length, 0);
});
test("all-source failure is reported as failure rather than empty success", async () => {
  const db = memoryDb(); let released = false, published = false;
  const handler = createAutomationHandler("jobs", { auth() {}, getDb: () => db, now: () => now, lock: async () => async () => { released = true; }, collect: async () => ({ jobs: [], diagnostics: [{ status: "failed", errors: ["timeout"] }] }), publish: async () => { published = true; } });
  const res = response(); await handler(request, res);
  assert.equal(res.code, 500); assert.match(res.body.error, /could not be verified/); assert.equal(published, false); assert.equal(released, true);
  assert.equal(db.tables.auto_run_logs[0].status, "error");
});
test("run-log failure is visible even after content was processed", async () => {
  const db = memoryDb({}, q => q.table === "auto_run_logs" ? { code: "42501", message: "denied" } : null);
  const handler = createAutomationHandler("news", { auth() {}, getDb: () => db, lock: async () => async () => {}, collect: async () => ({ news: [], diagnostics: [] }), publish: async () => ({ inserted: 1, refreshed: 0, rejected: 0 }) });
  const res = response(); await handler(request, res);
  assert.equal(res.code, 500); assert.equal(res.body.processed.inserted, 1); assert.match(res.body.error, /run log/);
});
test("secondary logging and cleanup exceptions cannot mask the original error", async () => {
  const db = { from() { return { insert() { throw new Error("log unavailable"); } }; } };
  const handler = createAutomationHandler("news", { auth() {}, getDb: () => db, lock: async () => async () => { throw new Error("cleanup failed"); }, collect: async () => { throw new Error("original source failure"); } });
  const res = response(); await handler(request, res);
  assert.equal(res.code, 500); assert.equal(res.body.error, "original source failure");
});
test("run lock prevents concurrent category runs and is released by its owner", async () => {
  const db = memoryDb();
  const release = await acquireRunLock(db, "news", now);
  await assert.rejects(acquireRunLock(db, "news", now), /already running/);
  const releaseJobs = await acquireRunLock(db, "jobs", now);
  await release(); await releaseJobs();
  assert.equal(db.tables.auto_posts.length, 0);
});
test("expired run lease can be reclaimed while stale release cannot delete new owner", async () => {
  const db = memoryDb();
  const releaseOld = await acquireRunLock(db, "news", new Date(+now - 21 * 60000));
  const releaseNew = await acquireRunLock(db, "news", now);
  await releaseOld(); assert.equal(db.tables.auto_posts.length, 1);
  await releaseNew(); assert.equal(db.tables.auto_posts.length, 0);
});
test("handler source options satisfy the real collector contract", async () => {
  const db = memoryDb(); let fetches = 0;
  const handler = createAutomationHandler("jobs", { auth() {}, getDb: () => db, now: () => now, collect: opts => collectVerifiedContent({ ...opts, fetchImpl: async () => { fetches++; return new Response(JSON.stringify({ content: [], totalFound: 0 }), { headers: { "content-type": "application/json" } }); } }) });
  const res = response(); await handler({ ...request, query: { dryRun: "true" } }, res);
  assert.equal(res.code, 200); assert.ok(fetches > 0); assert.equal(res.body.inserted, 0);
});
