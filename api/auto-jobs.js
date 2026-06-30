import {
  askOpenAI,
  collectRssItems,
  filterAlreadyPosted,
  getSupabaseAdmin,
  jobSources,
  logAutomation,
  markPosted,
  requireAutomationAuth,
  sendJson,
  sourceHash
} from "./_auto-utils.js";

const TYPE = "jobs";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  const supabase = getSupabaseAdmin();

  try {
    requireAutomationAuth(req);

    const requestedLimit = Number(req.query?.limit || req.body?.limit || 5);
    const limit = Math.min(Math.max(requestedLimit, 1), 8);

    const collected = await collectRssItems(jobSources, 40);
    const candidates = await filterAlreadyPosted(supabase, TYPE, collected);

    if (!candidates.length) {
      await logAutomation(supabase, TYPE, "skipped", "No new source items");
      return sendJson(res, 200, { success: true, inserted: 0, reason: "No new source items" });
    }

    const selection = await askOpenAI({
      system: "You manage the Darwin Life Hub jobs board. Select job-related items useful for Darwin residents. Do not invent salary, employer, or contact details. If details are missing, tell users to open the source link.",
      user: `Select up to ${limit} Darwin job items and rewrite them in Chinese for a jobs board. Source items:\n${JSON.stringify(candidates.slice(0, 25), null, 2)}`,
      schema: {
        items: [
          {
            source_url: "original link",
            title: "Chinese job title",
            company: "company if known, otherwise empty string",
            location: "Darwin or known suburb",
            contact: "查看来源链接",
            content: "Chinese job description, include source link and say details should be confirmed with employer",
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
        company: item.company || "",
        contact: item.contact || `查看来源链接：${source.link}`,
        content: `${item.content || source.description || ""}\n\n来源：${source.link}`,
        images: [],
        source_url: source.link,
        source_hash: sourceHash(source.link),
        ai_generated: true,
        views: 0,
        likes: 0,
        comments_count: 0,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabase
        .from("jobs_posts")
        .insert(payload)
        .select("id, title")
        .single();

      if (error) throw error;
      await markPosted(supabase, TYPE, source, "jobs_posts", data.id);
      inserted.push(data);
    }

    await logAutomation(supabase, TYPE, "success", `Inserted ${inserted.length} jobs`, { inserted });
    return sendJson(res, 200, { success: true, inserted: inserted.length, data: inserted });
  } catch (error) {
    const status = error.statusCode || 500;
    await logAutomation(supabase, TYPE, "error", error.message);
    return sendJson(res, status, { error: error.message });
  }
}
