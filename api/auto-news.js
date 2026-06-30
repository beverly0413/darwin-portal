import {
  askOpenAI,
  collectRssItems,
  filterAlreadyPosted,
  getSupabaseAdmin,
  logAutomation,
  markPosted,
  newsSources,
  requireAutomationAuth,
  sendJson,
  slugify,
  sourceHash
} from "./_auto-utils.js";

const TYPE = "news";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();

  try {
    requireAutomationAuth(req);

    const requestedLimit = Number(req.query?.limit || req.body?.limit || 3);
    const limit = Math.min(Math.max(requestedLimit, 1), 5);

    const collected = await collectRssItems(newsSources, 40);
    const candidates = await filterAlreadyPosted(supabase, TYPE, collected);

    if (!candidates.length) {
      await logAutomation(supabase, TYPE, "skipped", "No new source items");
      return sendJson(res, 200, { success: true, inserted: 0, reason: "No new source items" });
    }

    const selection = await askOpenAI({
      system: "You are the editor of Darwin Life Hub, a Chinese-language local portal for Darwin, Northern Territory. Choose only items that are useful to Darwin residents. Do not invent facts. Write concise Chinese. Keep source attribution.",
      user: `Select the best ${limit} news items for Darwin Chinese readers and rewrite them as Chinese news cards. Source items:\n${JSON.stringify(candidates.slice(0, 25), null, 2)}`,
      schema: {
        items: [
          {
            source_url: "original link",
            title: "Chinese title",
            summary: "Chinese summary under 120 Chinese characters",
            body: "Chinese article body, 4-7 short paragraphs, mention that details come from the source link",
            category: "local|policy|safety|business|weather|transport",
            score: 0
          }
        ]
      }
    });

    const items = Array.isArray(selection.items) ? selection.items.slice(0, limit) : [];
    const inserted = [];

    for (const item of items) {
      const source = candidates.find((candidate) => candidate.link === item.source_url) || candidates.find((candidate) => candidate.title === item.source_title);
      if (!source) continue;

      const body = `${item.body || item.summary || ""}\n\n来源：${source.link}`;
      const payload = {
        title: item.title || source.title,
        slug: slugify(item.title || source.title),
        summary: item.summary || source.description || "",
        content: body,
        html_body: body
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map((p) => `<p>${String(p).replace(/[<>&]/g, "")}</p>`)
          .join(""),
        body,
        source_url: source.link,
        source_hash: sourceHash(source.link),
        category: item.category || "local",
        author: "Darwin Life Hub AI",
        published: true,
        ai_generated: true,
        featured: false,
        views: 0,
        likes: 0,
        comments_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("news")
        .insert(payload)
        .select("id, title")
        .single();

      if (error) throw error;
      await markPosted(supabase, TYPE, source, "news", data.id);
      inserted.push(data);
    }

    await logAutomation(supabase, TYPE, "success", `Inserted ${inserted.length} news items`, { inserted });
    return sendJson(res, 200, { success: true, inserted: inserted.length, data: inserted });
  } catch (error) {
    const status = error.statusCode || 500;
    await logAutomation(supabase, TYPE, "error", error.message);
    return sendJson(res, status, { error: error.message });
  }
}
