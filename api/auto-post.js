export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const key = req.headers["x-auto-post-key"];

  if (key !== process.env.AUTO_POST_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { createClient } = await import("@supabase/supabase-js");

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const {
    board,
    category,
    title,
    content,
    contact,
    price,
    location,
    image_urls,
    user_id
  } = req.body;

  const finalCategory = category || board;

  if (!finalCategory || !title || !content) {
    return res.status(400).json({
      error: "Missing required fields: category/board, title, content"
    });
  }

  const insertPayload = {
    category: finalCategory,
    title,
    content,
    contact: contact || null,
    price: price || null,
    location: location || null,
    image_urls: image_urls || null,
    created_at: new Date().toISOString()
  };

  if (user_id) {
    insertPayload.user_id = user_id;
  }

  const { data, error } = await supabase
    .from("posts")
    .insert([insertPayload])
    .select();

  if (error) {
    return res.status(500).json({
      error: error.message
    });
  }

  return res.status(200).json({
    success: true,
    data
  });
}
