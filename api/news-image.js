import { fetchSourceImage, getSupabaseAdmin, sendJson } from "./_auto-utils.js";

export default async function handler(req, res) {
  if (!["GET", "POST"].includes(req.method)) {
    return sendJson(res, 405, { error: "Method not allowed" });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }

  const input = req.method === "GET" ? req.query || {} : req.body || {};
  const id = String(input.id || "").trim();
  let sourceUrl = String(input.source_url || "").trim();

  if (!sourceUrl && id) {
    const { data, error } = await supabase
      .from("news")
      .select("source_url")
      .eq("id", id)
      .single();

    if (error) return sendJson(res, 500, { error: error.message });
    sourceUrl = data?.source_url || "";
  }

  if (!sourceUrl) return sendJson(res, 400, { error: "Missing source_url" });

  const imageUrl = await fetchSourceImage(sourceUrl);
  if (!imageUrl) return sendJson(res, 404, { error: "No source image found" });

  if (id) {
    await supabase
      .from("news")
      .update({
        image_url: imageUrl,
        cover_image: imageUrl,
        cover_images: [imageUrl],
        updated_at: new Date().toISOString()
      })
      .eq("id", id);
  }

  return sendJson(res, 200, { imageUrl });
}
