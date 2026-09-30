export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(410).json({ error: "Automatic source-image copying is disabled. Add an authorized image through the editor." });
}
