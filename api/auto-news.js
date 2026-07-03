import {
  askOpenAI,
  collectRssItems,
  filterAlreadyPosted,
  fetchSourceImage,
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

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildArticleHtml(item, source, imageUrl = "") {
  const paragraphs = Array.isArray(item.paragraphs) ? item.paragraphs : [];
  const sourceTime = source.pubDate ? new Date(source.pubDate).toLocaleString("en-AU", { timeZone: "Australia/Darwin" }) : "";
  const imageHtml = imageUrl
    ? `<figure class="article-inline-image"><img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(item.title_zh || item.title || source.title)}" loading="lazy"></figure>`
    : "";

  const bodyHtml = paragraphs
    .map((p, index) => {
      const zh = p.zh || p.chinese || "";
      const en = p.en || p.english || "";
      if (!zh && !en) return "";
      return `
        <section class="bilingual-pair">
          ${index === 0 ? '<div class="article-subheading">What happened / 事件概览</div>' : ""}
          <p class="article-paragraph en">${escapeHtml(en)}</p>
          <p class="article-paragraph zh">${escapeHtml(zh)}</p>
        </section>
        ${index === 0 ? imageHtml : ""}
      `;
    })
    .join("");

  return `
    <div class="bilingual-news">
      ${bodyHtml || `${imageHtml}<p class="article-paragraph">${escapeHtml(item.body || item.summary_zh || item.summary || source.description || "")}</p>`}
    </div>
  `;
}

function buildPlainBody(item, source) {
  const sourceTime = source.pubDate ? new Date(source.pubDate).toLocaleString("en-AU", { timeZone: "Australia/Darwin" }) : "";
  const paragraphs = Array.isArray(item.paragraphs) ? item.paragraphs : [];
  const lines = paragraphs.flatMap((p) => [
    p.en || p.english || "",
    p.zh || p.chinese || ""
  ]).filter(Boolean);

  return [
    item.summary_zh || item.summary || "",
    item.summary_en || "",
    "",
    ...lines,
    "",
    `Published / 发布时间：${sourceTime || "Source time unavailable"}`
  ].join("\n").trim();
}

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
      system: "You are the editor of Darwin Life Hub, a bilingual local portal for Darwin, Northern Territory. Choose only items useful to Darwin residents. Do not invent facts. Preserve every concrete detail present in the supplied source title, description and publish date. Do not add a source URL paragraph inside the article body. If the supplied source has limited information, say that the source has not provided more detail. Do not reproduce copyrighted articles verbatim; produce a detailed bilingual rewrite based only on the supplied source item.",
      user: `Select the best ${limit} news items for Darwin Chinese readers and rewrite them as bilingual Chinese-English news articles. Keep all facts and details supplied by the source item; do not shorten or drop details. Format as alternating English paragraph then Chinese paragraph, matching the screenshot style. Source items:\n${JSON.stringify(candidates.slice(0, 25), null, 2)}`,
      schema: {
        items: [
          {
            source_url: "original link",
            title_zh: "Chinese title",
            title_en: "English title",
            summary_zh: "Chinese summary under 120 Chinese characters",
            summary_en: "English summary under 220 characters",
            paragraphs: [
              {
                zh: "Chinese paragraph with concrete source-backed detail",
                en: "Matching English paragraph"
              }
            ],
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

      const category = item.category || "local";
      const imageUrl = source.imageUrl || await fetchSourceImage(source.link);
      const body = buildPlainBody(item, source);
      const title = item.title_zh || item.title || source.title;
      const payload = {
        title,
        slug: slugify(title),
        summary: item.summary_zh || item.summary || source.description || "",
        content: body,
        html_body: buildArticleHtml(item, source, imageUrl),
        body,
        source_url: source.link,
        source_hash: sourceHash(source.link),
        category,
        image_url: imageUrl || null,
        cover_image: imageUrl || null,
        cover_images: imageUrl ? [imageUrl] : [],
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
