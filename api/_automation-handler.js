import crypto from "node:crypto";
import { getSupabaseAdmin, requireAutomationAuth, sendJson } from "./_auto-utils.js";
import { collectVerifiedContent } from "./_content-sources.js";
import { publishItems } from "./_content-pipeline.js";

const LIMITS = { news: [3, 5], jobs: [5, 15], events: [8, 15] };

export async function acquireRunLock(db, type, now = new Date()) {
  const token = crypto.randomUUID();
  const source_hash = crypto.createHash("sha256").update(`darwinbbs-run-lock:${type}`).digest("hex");
  const lockType = `lock:${type}`;
  const payload = { type: lockType, source_hash, source_url: `https://www.darwinbbs.com/api/auto-${type}`, source_title: "Automation run lock", target_table: "", target_id: token, posted_at: now.toISOString() };
  const inserted = await db.from("auto_posts").insert(payload);
  if (inserted.error && inserted.error.code !== "23505") throw new Error(`Cannot acquire run lock: ${inserted.error.message}`);
  if (inserted.error?.code === "23505") {
    const current = await db.from("auto_posts").select("target_id,posted_at").eq("type", lockType).eq("source_hash", source_hash).maybeSingle();
    if (current.error) throw new Error(`Cannot inspect run lock: ${current.error.message}`);
    if (!current.data || !Number.isFinite(Date.parse(current.data.posted_at)) || Date.parse(current.data.posted_at) > +now - 20 * 60000) throw Object.assign(new Error("Another update is already running"), { statusCode: 409 });
    const renewed = await db.from("auto_posts").update({ target_id: token, posted_at: now.toISOString() }).eq("type", lockType).eq("source_hash", source_hash).eq("target_id", current.data.target_id).select("target_id");
    if (renewed.error || !renewed.data?.length) throw Object.assign(new Error("Another update acquired the run lock"), { statusCode: 409 });
  }
  return async () => {
    const result = await db.from("auto_posts").delete().eq("type", lockType).eq("source_hash", source_hash).eq("target_id", token);
    if (result.error) console.error("Unable to release automation lock", type, result.error.code);
  };
}

export function parseOptions(req, type) {
  const supplied = req.query?.limit ?? req.body?.limit ?? LIMITS[type][0];
  const limit = Number(supplied);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > LIMITS[type][1]) throw Object.assign(new Error(`limit must be an integer from 1 to ${LIMITS[type][1]}`), { statusCode: 400 });
  return { limit, dryRun: req.query?.dryRun === "true" || req.body?.dryRun === true };
}

export function createAutomationHandler(type, dependencies = {}) {
  const getDb = dependencies.getDb || getSupabaseAdmin;
  const collect = dependencies.collect || collectVerifiedContent;
  const publish = dependencies.publish || publishItems;
  const auth = dependencies.auth || requireAutomationAuth;
  const lock = dependencies.lock || acquireRunLock;
  const clock = dependencies.now || (() => new Date());
  return async function handler(req, res) {
    res.setHeader?.("Cache-Control", "no-store");
    if (!["GET", "POST"].includes(req.method)) return sendJson(res, 405, { error: "Method not allowed" });
    let db, release, options, stats;
    try {
      auth(req);
      options = parseOptions(req, type);
      db = getDb();
      const now = clock();
      if (!options.dryRun) release = await lock(db, type, now);
      const result = await collect({ types: [type], now, limitPerSource: 12 });
      const diagnostics = result.diagnostics || [];
      const sourceFailures = diagnostics.filter(entry => ["error", "blocked", "failed", "partial"].includes(entry.status) || entry.error || entry.errors?.length);
      if (!Array.isArray(result[type])) throw new Error("Source adapter returned invalid data");
      if (!result[type].length && sourceFailures.length) throw new Error("Sources could not be verified; no content published");
      stats = await publish({ supabase: db, type, items: result[type], limit: options.limit, now, dryRun: options.dryRun });
      const summary = { ...stats, dryRun: options.dryRun, sources: diagnostics, checkedAt: now.toISOString() };
      if (!options.dryRun) {
        const logged = await db.from("auto_run_logs").insert({ type, status: sourceFailures.length || stats.pending ? "partial" : "success", message: `Inserted ${stats.inserted}; refreshed ${stats.refreshed}; rejected ${stats.rejected}; pending reconciliation ${stats.pending}`, meta: summary });
        if (logged.error) throw new Error("Content processed, but run log could not be saved");
      }
      return sendJson(res, 200, { success: true, ...summary });
    } catch (error) {
      if (db && !options?.dryRun && error.statusCode !== 409) {
        try {
          const logged = await db.from("auto_run_logs").insert({ type, status: "error", message: String(error.message).slice(0, 500), meta: stats || {} });
          if (logged.error) console.error("Automation error log failed", type, logged.error.code);
        } catch { console.error("Automation error log unreachable", type); }
      }
      return sendJson(res, error.statusCode || 500, { success: false, error: error.message, ...(stats ? { processed: stats } : {}) });
    } finally {
      if (release) { try { await release(); } catch { console.error("Automation lock cleanup unreachable", type); } }
    }
  };
}
