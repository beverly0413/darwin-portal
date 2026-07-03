import { getSupabaseAdmin, sendJson } from "./_auto-utils.js";

function cleanComment(value) {
  return String(value || "").trim().slice(0, 2000);
}

function cleanName(value) {
  return String(value || "匿名").trim().slice(0, 40) || "匿名";
}

export default async function handler(req, res) {
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }

  if (req.method === "GET") {
    const newsId = String(req.query?.news_id || "").trim();
    if (!newsId) return sendJson(res, 400, { error: "Missing news_id" });

    const { data, error } = await supabase
      .from("news_comments")
      .select("id, news_id, content, name, created_at")
      .eq("news_id", newsId)
      .order("created_at", { ascending: true });

    if (error) return sendJson(res, 500, { error: error.message });
    return sendJson(res, 200, { data: data || [] });
  }

  if (req.method === "POST") {
    const body = req.body || {};
    const newsId = String(body.news_id || "").trim();
    const content = cleanComment(body.content);
    const name = cleanName(body.name);

    if (!newsId || !content) {
      return sendJson(res, 400, { error: "Missing news_id or content" });
    }

    const { error } = await supabase.from("news_comments").insert({
      news_id: newsId,
      content,
      name,
    });

    if (error) return sendJson(res, 500, { error: error.message });

    const { count } = await supabase
      .from("news_comments")
      .select("id", { count: "exact", head: true })
      .eq("news_id", newsId);

    const nextCount = Number(count || 0);
    await supabase.from("news").update({ comments_count: nextCount }).eq("id", newsId);

    return sendJson(res, 200, { success: true, count: nextCount });
  }

  return sendJson(res, 405, { error: "Method not allowed" });
}
