// Read-only source smoke check: no Supabase, API key, writes, or generated content.
import { collectVerifiedContent } from "../api/_content-sources.js";
import { validateCandidate, buildPayload } from "../api/_content-pipeline.js";
const types = process.argv.slice(2).length ? process.argv.slice(2) : ["news", "jobs", "events"];
const now = new Date();
const result = await collectVerifiedContent({ types, now, limitPerSource: 8 });
const output = { checkedAt: now.toISOString(), diagnostics: result.diagnostics, categories: {} };
for (const type of types) {
  const candidates = result[type].map(item => ({ item, rejection: validateCandidate(type, item, now) }));
  output.categories[type] = {
    eligible: candidates.filter(value => !value.rejection).length,
    rejected: candidates.filter(value => value.rejection).map(value => ({ title: value.item.title, reason: value.rejection })),
    items: candidates.filter(value => !value.rejection).map(({ item }) => {
      const payload = buildPayload(type, item, now);
      return { title: payload.title, sourceUrl: payload.source_url, publishedAt: item.publishedAt, expiresAt: item.endAt || item.expiresAt || null };
    })
  };
}
console.log(JSON.stringify(output, null, 2));
if (result.diagnostics.some(source => ["failed", "partial"].includes(source.status))) process.exitCode = 2;
