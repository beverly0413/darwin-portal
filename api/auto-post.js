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
    title,
    content,
    contact,
    price,
    location
  } = req.body;

  if (!board || !title || !content) {
    return res.status(400).json({
      error: "Missing required fields"
    });
  }

  const { data, error } = await supabase
    .from("posts")
    .insert([
      {
        board,
        title,
        content,
        contact,
        price,
        location,
        created_at: new Date().toISOString()
      }
    ]);

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
