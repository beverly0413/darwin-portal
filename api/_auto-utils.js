import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export const newsSources = [
  "https://news.google.com/rss/search?q=Darwin%20Northern%20Territory%20when:2d&hl=en-AU&gl=AU&ceid=AU:en",
  "https://news.google.com/rss/search?q=NT%20News%20Darwin%20when:2d&hl=en-AU&gl=AU&ceid=AU:en",
  "https://news.google.com/rss/search?q=ABC%20Darwin%20Northern%20Territory%20when:2d&hl=en-AU&gl=AU&ceid=AU:en"
];

export const jobSources = [
  "https://news.google.com/rss/search?q=Darwin%20jobs%20hiring%20Northern%20Territory%20when:7d&hl=en-AU&gl=AU&ceid=AU:en",
  "https://news.google.com/rss/search?q=Darwin%20hospitality%20jobs%20when:7d&hl=en-AU&gl=AU&ceid=AU:en",
  "https://news.google.com/rss/search?q=Darwin%20construction%20jobs%20when:7d&hl=en-AU&gl=AU&ceid=AU:en"
];

export const eventSources = [
  "https://news.google.com/rss/search?q=Darwin%20events%20this%20week%20when:14d&hl=en-AU&gl=AU&ceid=AU:en",
  "https://news.google.com/rss/search?q=Darwin%20market%20festival%20music%20when:14d&hl=en-AU&gl=AU&ceid=AU:en",
  "https://news.google.com/rss/search?q=Darwin%20family%20free%20events%20when:14d&hl=en-AU&gl=AU&ceid=AU:en"
];

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

export function requireAutomationAuth(req) {
  const userAgent = String(req.headers["user-agent"] || "").toLowerCase();
  if (req.headers["x-vercel-cron"] || userAgent.includes("vercel-cron")) {
    return true;
  }

  const configuredKey = process.env.AUTO_POST_KEY || process.env.CRON_SECRET || "";
  if (!configuredKey) return true;

  const headerKey = req.headers["x-auto-post-key"];
  const auth = req.headers.authorization || "";
  const queryKey = req.query?.key;
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";

  if ([headerKey, queryKey, bearer].includes(configuredKey)) return true;

  throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
}

export function sendJson(res, status, payload) {
  res.status(status).json(payload);
}

export function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeEntities(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

export function sourceHash(url) {
  return crypto.createHash("sha256").update(String(url || "")).digest("hex");
}

export function slugify(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^\w\u4e00-\u9fa5-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "DarwinLifeHubBot/1.0 (+https://darwinbbs.com)"
    }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

export function parseRssItems(xml, sourceUrl) {
  const itemBlocks = [...String(xml || "").matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  return itemBlocks.map((block) => {
    const pick = (tag) => {
      const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
      return decodeEntities(match?.[1] || "");
    };

    const title = stripHtml(pick("title"));
    const description = stripHtml(pick("description"));
    const link = stripHtml(pick("link"));
    const pubDate = stripHtml(pick("pubDate"));

    return {
      title,
      description,
      link,
      pubDate,
      sourceFeed: sourceUrl
    };
  }).filter((item) => item.title && item.link);
}

export async function collectRssItems(urls, limit = 30) {
  const results = await Promise.allSettled(
    urls.map(async (url) => parseRssItems(await fetchText(url), url))
  );

  const items = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
  const seen = new Set();
  return items.filter((item) => {
    const key = item.link || item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

export async function logAutomation(supabase, type, status, message, meta = {}) {
  try {
    await supabase.from("auto_run_logs").insert({
      type,
      status,
      message,
      meta
    });
  } catch (error) {
    console.error("auto_run_logs insert failed", error);
  }
}

export async function filterAlreadyPosted(supabase, type, items) {
  const hashes = items.map((item) => sourceHash(item.link));
  if (!hashes.length) return [];

  const { data, error } = await supabase
    .from("auto_posts")
    .select("source_hash")
    .eq("type", type)
    .in("source_hash", hashes);

  if (error) {
    console.error("auto_posts lookup failed", error);
    return items;
  }

  const posted = new Set((data || []).map((row) => row.source_hash));
  return items.filter((item) => !posted.has(sourceHash(item.link)));
}

export async function markPosted(supabase, type, item, targetTable, targetId) {
  await supabase.from("auto_posts").upsert({
    type,
    source_url: item.link,
    source_hash: sourceHash(item.link),
    source_title: item.title,
    target_table: targetTable,
    target_id: String(targetId || ""),
    posted_at: new Date().toISOString()
  }, {
    onConflict: "type,source_hash"
  });
}

export async function askOpenAI({ system, user, schema }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      temperature: 0.35,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: `${user}\n\nReturn JSON matching this shape:\n${JSON.stringify(schema)}` }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI failed ${response.status}: ${text}`);
  }

  const json = await response.json();
  const content = json.choices?.[0]?.message?.content || "{}";
  return JSON.parse(content);
}
