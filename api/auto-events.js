import {
  askOpenAI,
  collectRssItems,
  eventSources,
  filterAlreadyPosted,
  getSupabaseAdmin,
  logAutomation,
  markPosted,
  requireAutomationAuth,
  sendJson,
  sourceHash
} from "./_auto-utils.js";

const TYPE = "events";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();

  try {
    requireAutomationAuth(req);

    const requestedLimit = Number(req.query?.limit || req.body?.limit || 8);
    const limit = Math.min(Math.max(requestedLimit, 1), 12);

    const collected = await collectRssItems(eventSources, 50);
    const candidates = await filterAlreadyPosted(supabase, TYPE, collected);

    if (!candidates.length) {
      await logAutomation(supabase, TYPE, "skipped", "No new source items");
      return sendJson(res, 200, { success: true, inserted: 0, reason: "No new source items" });
    }

    const selection = await askOpenAI({
      system: "You curate Darwin events for a Chinese-language local portal. Select genuine Darwin events only. Do not invent dates, locations, or prices. If unclear, mark as to be confirmed.",
      user: `Select up to ${limit} Darwin events and produce Chinese event cards. Source items:\n${JSON.stringify(candidates.slice(0, 30), null, 2)}`,
      schema: {
        items: [
          {
            source_url: "original link",
            title: "Chinese event title",
            summary: "Chinese summary under 120 Chinese characters",
            event_date: "YYYY-MM-DD or null",
            location: "location or 待确认",
            price: "免费|按场地|待确认",
            category: "free family market music nightlife community",
            score: 0
          }
        ]
      }
    });

    const items = Array.isArray(selection.items) ? selection.items.slice(0, limit) : [];
    const inserted = [];

    for (const item of items) {
      const source = candidates.find((candidate) => candidate.link === item.source_url);
      if (!source) continue;

      const payload = {
        title: item.title || source.title,
        summary: item.summary || source.description || "",
        description: `${item.summary || source.description || ""}\n\n来源：${source.link}`,
        event_date: item.event_date || null,
        location: item.location || "待确认",
        price: item.price || "待确认",
        price_label: item.price || "待确认",
        category: item.category || "community",
        tags: item.category || "community",
        source_url: source.link,
        source_hash: sourceHash(source.link),
        ai_generated: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("events")
        .insert(payload)
        .select("id, title")
        .single();

      if (error) throw error;
      await markPosted(supabase, TYPE, source, "events", data.id);
      inserted.push(data);
    }

    await logAutomation(supabase, TYPE, "success", `Inserted ${inserted.length} events`, { inserted });
    return sendJson(res, 200, { success: true, inserted: inserted.length, data: inserted });
  } catch (error) {
    const status = error.statusCode || 500;
    await logAutomation(supabase, TYPE, "error", error.message);
    return sendJson(res, status, { error: error.message });
  }
}
