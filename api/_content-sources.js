/**
 * Bounded, read-only public content sources. No credentials, generated articles,
 * guessed dates, search-result vacancies, or unverified fallback content.
 *
 * SmartRecruiters' documented GET /companies/{id}/postings endpoint lists active
 * employer postings: https://developers.smartrecruiters.com/docs/endpoints
 * We require membership in that live list AND a matching public detail response.
 * Sources without an original posting date (e.g. Darwin council careers) are
 * deliberately omitted. NTPFES RSS is omitted because redistribution needs consent.
 */
const DAY = 86400000;
const MAX_BYTES = 2_500_000;
const COUNCIL = 'https://www.darwin.nt.gov.au';
const SMART_API = 'https://api.smartrecruiters.com/v1/companies/';
const SMART_HOSTS = ['api.smartrecruiters.com'];
const COUNCIL_HOSTS = ['www.darwin.nt.gov.au'];
const ABC_HOSTS = ['www.abc.net.au'];
const JOB_LINK_HOSTS = ['jobs.smartrecruiters.com', 'www.smartrecruiters.com'];

export const SOURCE_REGISTRY = Object.freeze([
  { id: 'sodexo-darwin', type: 'jobs', name: 'Sodexo', company: 'Sodexo', url: `${SMART_API}Sodexo/postings?limit=100&country=au&city=Darwin` },
  { id: 'sodexo-nt', type: 'jobs', name: 'Sodexo', company: 'Sodexo', url: `${SMART_API}Sodexo/postings?limit=100&country=au&city=Northern%20Territory` },
  { id: 'minor-hotels-darwin', type: 'jobs', name: 'Minor Hotels', company: 'MinorInternational', url: `${SMART_API}MinorInternational/postings?limit=100&country=au&q=Darwin` },
  { id: 'accor-darwin', type: 'jobs', name: 'Accor', company: 'AccorHotel', url: `${SMART_API}AccorHotel/postings?limit=100&country=au&q=Darwin` },
  { id: 'darwin-council-events', type: 'events', name: 'City of Darwin', url: `${COUNCIL}/community/things-to-do/whats-on` },
  { id: 'abc-nt-news', type: 'news', name: 'ABC News', adapter: 'abc', url: 'https://www.abc.net.au/news/nt' },
  { id: 'darwin-council-news', type: 'news', name: 'City of Darwin', url: `${COUNCIL}/news` },
].map(Object.freeze));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };
export function decodeEntities(value = '') {
  return String(value).replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code) => {
    if (code[0] !== '#') return ENTITIES[code.toLowerCase()] ?? entity;
    const number = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1));
    return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : '';
  });
}

// These parsers never execute HTML; only allowlisted source fields are returned.
function htmlTree(html) {
  if (typeof html !== 'string' || html.length > MAX_BYTES) throw new Error('invalid_or_oversized_document');
  const root = { tag: 'root', attrs: {}, children: [] };
  const stack = [root];
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  const tokens = clean.match(/<\/?[a-z][^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+/gi) || [];
  if (tokens.length > 120000) throw new Error('document_too_complex');
  const voids = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  for (const token of tokens) {
    if (token[0] !== '<') { stack.at(-1).children.push(token); continue; }
    const closing = /^<\//.test(token);
    const tag = token.match(/^<\/?([a-z][\w:-]*)/i)?.[1].toLowerCase();
    if (!tag) continue;
    if (closing) {
      for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      continue;
    }
    const attrs = {};
    const attrText = token.slice(tag.length + 1, -1);
    for (const match of attrText.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
    const node = { tag, attrs, children: [] };
    stack.at(-1).children.push(node);
    if (!voids.has(tag) && !/\/\s*>$/.test(token)) {
      if (stack.length > 128) throw new Error('document_too_deep');
      stack.push(node);
    }
  }
  return root;
}
function nodes(node, predicate) {
  const output = [];
  function walk(current) { if (typeof current === 'string') return; if (predicate(current)) output.push(current); for (const child of current.children) walk(child); }
  walk(node); return output;
}
function hasClass(node, name) { return (node.attrs.class || '').split(/\s+/).includes(name); }
function field(node, name) { return nodes(node, n => hasClass(n, `field--name-${name}`))[0]; }
function nodeText(node) {
  if (!node) return '';
  if (typeof node === 'string') return decodeEntities(node);
  return node.children.map(nodeText).join(' ').replace(/\s+/g, ' ').trim();
}
export function plainText(html = '') { return nodeText(htmlTree(String(html))).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim(); }
function excerpt(value, title = '') {
  const text = plainText(value);
  const wordBudget = Math.max(0, 25 - title.trim().split(/\s+/).filter(Boolean).length);
  // Short source extract, never a full republished article or an AI expansion.
  const shortened = text.split(/\s+/).slice(0, wordBudget).join(' ').slice(0, 240).trim();
  return shortened && shortened.length < text.length ? `${shortened}…` : shortened;
}

/** Public HTTPS URLs only. Fetch additionally enforces exact fixed host allowlists. */
export function canonicalUrl(value, base, allowedHosts) {
  try {
    if (typeof value !== 'string' || !value.trim() || /[\u0000-\u0020\\]/.test(value)) return null;
    const url = new URL(decodeEntities(value), base);
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) return null;
    if (!url.hostname.includes('.') || url.hostname.endsWith('.local') || url.hostname.endsWith('.localhost') || /^(?:\d+\.){3}\d+$/.test(url.hostname) || url.hostname.startsWith('[')) return null;
    if (allowedHosts && !allowedHosts.includes(url.hostname)) return null;
    url.hash = '';
    for (const name of [...url.searchParams.keys()]) if (/^(utm_.+|fbclid|gclid|mc_cid|mc_eid)$/i.test(name)) url.searchParams.delete(name);
    return url.href;
  } catch { return null; }
}

/** Strict source dates. Date-only NT values mean local midnight, not UTC. */
export function sourceDate(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2}))?$/);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  if (y < 2000 || y > 2100 || m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  if (hour && (Number(hour) > 23 || Number(minute) > 59 || Number(second || 0) > 59)) return null;
  const date = new Date(hour ? value : `${value}T00:00:00+09:30`);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}
function inLastDays(date, now, days) { return !!date && Date.parse(date) <= now.getTime() && Date.parse(date) >= now.getTime() - days * DAY; }
function validNow(value) { const date = value instanceof Date ? value : new Date(value); if (!Number.isFinite(date.getTime())) throw new Error('invalid_now'); return date; }
function ntLocation(location) {
  if (!location || !['au', 'australia'].includes(String(location.country || location.countryCode || '').toLowerCase())) return false;
  const region = String(location.region || '').toLowerCase();
  const city = String(location.city || '').toLowerCase().trim();
  return ['nt', 'northern territory'].includes(region) || /^(darwin(?: city| nt)?|northern territory|alice springs(?: nt)?|palmerston(?: nt)?|katherine(?: nt)?|tennant creek(?: nt)?|nhulunbuy(?: nt)?|jabiru(?: nt)?|yulara(?: nt)?)$/.test(city);
}

function readOnlySourceUrl(value, base, allowedHosts) {
  const canonical = canonicalUrl(value, base, allowedHosts);
  if (!canonical) return null;
  const url = new URL(canonical);
  if (url.hostname === 'api.smartrecruiters.com') {
    if (!/^\/v1\/companies\/(?:Sodexo|MinorInternational|AccorHotel)\/postings(?:\/\d{1,24})?$/.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some(key => !['limit', 'country', 'city', 'q', 'offset'].includes(key))) return null;
  } else if (url.hostname === 'www.darwin.nt.gov.au') {
    if (!/^(?:\/news|\/community\/things-to-do\/whats-on|\/(?:explore\/whats-on|council\/news-media)\/[a-z0-9-]+)\/?$/.test(url.pathname) || url.search) return null;
  } else if (url.hostname === 'www.abc.net.au') {
    if (!/^(?:\/news\/nt|\/news\/\d{4}-\d{2}-\d{2}\/[a-z0-9-]+\/\d+)\/?$/.test(url.pathname) || url.search) return null;
  } else return null;
  return canonical;
}

export async function safeFetchText(url, { fetchImpl = globalThis.fetch, allowedHosts, timeoutMs = 12000, maxBytes = MAX_BYTES, deadline = Infinity } = {}) {
  if (!Array.isArray(allowedHosts) || !allowedHosts.length) throw new Error('host_allowlist_required');
  let current = readOnlySourceUrl(url, undefined, allowedHosts);
  if (!current) throw new Error('unsafe_source_url');
  const controller = new AbortController();
  const remaining = Math.min(timeoutMs, deadline - Date.now());
  if (remaining <= 0) throw new Error('source_deadline_exceeded');
  const timer = setTimeout(() => controller.abort(), remaining);
  try {
    for (let redirects = 0; redirects <= 3; redirects++) {
      const response = await fetchImpl(current, { method: 'GET', redirect: 'manual', signal: controller.signal, headers: { Accept: 'application/json, text/html;q=0.9, application/rss+xml;q=0.8', 'User-Agent': 'DarwinPortalContentBot/1.0 (daily public listing checks)' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const target = readOnlySourceUrl(response.headers.get('location'), current, allowedHosts);
        if (!target || redirects === 3) throw new Error('unsafe_or_excessive_redirect');
        try { await response.body?.cancel(); } catch { /* optional stream cleanup */ }
        current = target; continue;
      }
      if (!response.ok) throw new Error(`source_http_${response.status}`);
      if (response.url && !readOnlySourceUrl(response.url, undefined, allowedHosts)) throw new Error('unsafe_response_url');
      const contentType = response.headers.get('content-type') || '';
      if (contentType && !/^(?:text\/(?:html|plain|xml)|application\/(?:json|[^;]+\+json|xml|rss\+xml|atom\+xml|xhtml\+xml))(?:;|$)/i.test(contentType)) throw new Error('unsupported_content_type');
      const length = Number(response.headers.get('content-length'));
      if (Number.isFinite(length) && length > maxBytes) throw new Error('source_too_large');
      let text;
      if (response.body?.getReader) {
        const reader = response.body.getReader(); const decoder = new TextDecoder(); let bytes = 0; const parts = [];
        try {
          for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength; if (bytes > maxBytes) { await reader.cancel(); throw new Error('source_too_large'); } parts.push(decoder.decode(chunk.value, { stream: true })); }
          parts.push(decoder.decode()); text = parts.join('');
        } finally { reader.releaseLock(); }
      } else {
        text = await response.text(); if (new TextEncoder().encode(text).byteLength > maxBytes) throw new Error('source_too_large');
      }
      return { text, url: current };
    }
    throw new Error('source_redirect_failure');
  } finally { clearTimeout(timer); }
}

export function parseSmartRecruitersJob(detail, { listing, source, now = new Date(), listingUrl = source?.url, detailUrl } = {}) {
  now = validNow(now);
  if (!detail || !listing || !source || detail.id !== listing.id || !/^\d{1,24}$/.test(String(detail.id))) return null;
  if (detail.company?.identifier !== source.company || listing.company?.identifier !== source.company || detail.visibility !== 'PUBLIC' || listing.visibility !== 'PUBLIC') return null;
  if (!ntLocation(detail.location) || !ntLocation(listing.location)) return null;
  const publishedAt = sourceDate(detail.releasedDate);
  if (!inLastDays(publishedAt, now, 30) || publishedAt !== sourceDate(listing.releasedDate)) return null;
  const sourceUrl = canonicalUrl(detail.postingUrl, undefined, JOB_LINK_HOSTS);
  const applyUrl = canonicalUrl(detail.applyUrl, undefined, JOB_LINK_HOSTS);
  if (!sourceUrl || !applyUrl) return null;
  const expectedPath = `/${source.company}/${detail.id}`;
  if (![sourceUrl, applyUrl].every(url => { const path = new URL(url).pathname; return path === expectedPath || path.startsWith(`${expectedPath}-`); })) return null;
  const title = plainText(detail.name || '').slice(0, 240);
  const employer = plainText(detail.company.name || '').slice(0, 160);
  const description = detail.jobAd?.sections?.jobDescription?.text;
  if (!title || title.split(/\s+/).length > 24 || !employer || typeof description !== 'string' || !plainText(description)) return null;
  if (/\b(?:job|position|vacancy|applications?)\s+(?:(?:is|are|has|have|been|now)\s+)*(?:closed|filled|expired|withdrawn)\b/i.test(`${title} ${plainText(description)}`)) return null;
  const expiresAt = detail.validThrough ? sourceDate(detail.validThrough) : null;
  if (detail.validThrough && (!expiresAt || Date.parse(expiresAt) <= now.getTime())) return null;
  return {
    type: 'jobs', title, excerpt: excerpt(description, title), sourceUrl, applyUrl, applicationUrl: applyUrl,
    sourceName: source.name, sourceId: source.id, employer, publishedAt, datePosted: publishedAt, expiresAt,
    location: plainText(detail.location.fullLocation || [detail.location.city, detail.location.region, 'Australia'].filter(Boolean).join(', ')),
    employmentType: plainText(detail.typeOfEmployment?.label || ''), status: 'open',
    evidence: { type: 'active-employer-api', activeListing: true, checkedAt: now.toISOString(), listingUrl, detailUrl, originalDateField: 'releasedDate' },
  };
}

export function parseDarwinEventLinks(html, { now = new Date(), limit = 12 } = {}) {
  now = validNow(now);
  const tree = htmlTree(html);
  const cards = nodes(tree, n => hasClass(n, 'node--type-event') && hasClass(n, 'node--view-mode-card-view'));
  if (!cards.length) throw new Error('event_listing_markup_changed');
  const result = [];
  for (const card of cards) {
    const link = nodes(field(card, 'node-title') || card, n => n.tag === 'a')[0]?.attrs.href;
    const url = canonicalUrl(link, COUNCIL, COUNCIL_HOSTS);
    if (!url || !new URL(url).pathname.startsWith('/explore/whats-on/')) continue;
    const dates = nodes(field(card, 'field-date-smart') || card, n => n.tag === 'time').map(n => sourceDate(n.attrs.datetime));
    if (dates.length < 2 || !dates[0] || !dates[1] || Date.parse(dates[1]) <= now.getTime() || Date.parse(dates[0]) > now.getTime() + 180 * DAY) continue;
    if (Date.parse(dates[1]) <= Date.parse(dates[0]) || Date.parse(dates[1]) - Date.parse(dates[0]) > 90 * DAY) continue;
    result.push({ url, startAt: dates[0] });
  }
  return [...new Map(result.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)).map(item => [item.url, item])).values()].slice(0, limit).map(item => item.url);
}

export function parseDarwinEvent(html, { sourceUrl, now = new Date(), source = SOURCE_REGISTRY.find(s => s.type === 'events') } = {}) {
  now = validNow(now);
  sourceUrl = canonicalUrl(sourceUrl, COUNCIL, COUNCIL_HOSTS);
  if (!sourceUrl || !new URL(sourceUrl).pathname.startsWith('/explore/whats-on/')) return null;
  const tree = htmlTree(html);
  const event = nodes(tree, n => hasClass(n, 'node--type-event') && hasClass(n, 'node--view-mode-full'))[0];
  if (!event) return null;
  const title = nodeText(field(event, 'node-title')).slice(0, 240);
  const organizer = nodeText(field(event, 'field-organisation')).slice(0, 160);
  const location = nodeText(field(event, 'field-event-location')).slice(0, 400);
  const body = nodeText(field(event, 'body'));
  if (!title || title.split(/\s+/).length > 24 || !organizer || !location || !/\bNT\b|Northern Territory/i.test(location) || !body) return null;
  if (/\b(cancelled|canceled|postponed|sold out)\b/i.test(`${title} ${body}`)) return null;
  const times = nodes(field(event, 'field-date-smart') || event, n => n.tag === 'time').map(n => sourceDate(n.attrs.datetime));
  let occurrence;
  for (let i = 0; i + 1 < times.length; i += 2) {
    const startAt = times[i], endAt = times[i + 1];
    if (!startAt || !endAt || Date.parse(endAt) <= now.getTime() || Date.parse(endAt) <= Date.parse(startAt) || Date.parse(endAt) - Date.parse(startAt) > 90 * DAY || Date.parse(startAt) > now.getTime() + 180 * DAY) continue;
    if (!occurrence || startAt < occurrence.startAt) occurrence = { startAt, endAt };
  }
  if (!occurrence) return null;
  return { type: 'events', title, excerpt: excerpt(body, title), sourceUrl, sourceName: source.name, sourceId: source.id, organizer, location, publishedAt: null, ...occurrence, expiresAt: occurrence.endAt, status: Date.parse(occurrence.startAt) <= now.getTime() ? 'ongoing' : 'scheduled', evidence: { type: 'organizer-calendar', checkedAt: now.toISOString(), organizer, datesField: 'field-date-smart', timezone: 'Australia/Darwin' } };
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function councilNewsDate(text) {
  const match = text.match(/^(?:Posted\s+)?(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\s+(\d{4})$/);
  if (!match || !MONTHS[match[2].slice(0, 3).toLowerCase()]) return null;
  return sourceDate(`${match[3]}-${String(MONTHS[match[2].slice(0, 3).toLowerCase()]).padStart(2, '0')}-${match[1].padStart(2, '0')}`);
}
export function parseDarwinNews(html, { now = new Date(), limit = 12, source = SOURCE_REGISTRY.find(s => s.id === 'darwin-council-news') } = {}) {
  now = validNow(now);
  const cards = nodes(htmlTree(html), n => hasClass(n, 'node--type-article') && hasClass(n, 'node--view-mode-card-view'));
  if (!cards.length) throw new Error('news_listing_markup_changed');
  const result = [];
  for (const card of cards) {
    const titleField = field(card, 'node-title');
    const title = nodeText(titleField).slice(0, 240);
    const sourceUrl = canonicalUrl(nodes(titleField || card, n => n.tag === 'a')[0]?.attrs.href, COUNCIL, COUNCIL_HOSTS);
    const publishedAt = councilNewsDate(nodeText(field(card, 'field-publish-date')));
    const body = nodeText(field(card, 'body'));
    if (!title || title.split(/\s+/).length > 24 || !body || !sourceUrl || !new URL(sourceUrl).pathname.startsWith('/council/news-media/') || !inLastDays(publishedAt, now, 3)) continue;
    result.push({ type: 'news', title, excerpt: excerpt(body, title), sourceUrl, sourceName: source.name, sourceId: source.id, publishedAt, location: 'Darwin, NT', evidence: { type: 'publisher-listing', checkedAt: now.toISOString(), originalDateField: 'field-publish-date', excerptOnly: true } });
  }
  return [...new Map(result.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)).map(item => [item.sourceUrl, item])).values()].slice(0, limit);
}

// ABC's NT listing includes national stories too. Require an NT place in the
// headline, synopsis or keywords, then read original datePublished on the detail.
const NT_NEWS = /\b(?:Northern Territory|Darwin|Alice Springs|Katherine|Tennant Creek|Nhulunbuy|Kakadu|Uluru|Yulara|Palmerston|NT)\b/i;
export function parseAbcNewsLinks(html, { now = new Date(), limit = 12 } = {}) {
  now = validNow(now);
  const cards = nodes(htmlTree(html), node => node.tag === 'article' && node.attrs['data-component'] === 'DetailCard');
  if (!cards.length) throw new Error('abc_listing_markup_changed');
  const result = [];
  for (const card of cards) {
    const heading = nodes(card, node => /^h[1-6]$/.test(node.tag))[0];
    const link = nodes(heading || card, node => node.tag === 'a')[0];
    const url = readOnlySourceUrl(link?.attrs.href, 'https://www.abc.net.au', ABC_HOSTS);
    const updatedAt = sourceDate(nodes(card, node => node.tag === 'time')[0]?.attrs.datetime);
    if (url && /\/news\/\d{4}-/.test(url) && inLastDays(updatedAt, now, 3) && NT_NEWS.test(nodeText(card))) result.push(url);
  }
  return [...new Set(result)].slice(0, limit);
}
export function parseAbcNews(html, { sourceUrl, now = new Date(), source = SOURCE_REGISTRY.find(s => s.id === 'abc-nt-news') } = {}) {
  now = validNow(now);
  sourceUrl = readOnlySourceUrl(sourceUrl, undefined, ABC_HOSTS);
  if (!sourceUrl || !/\/news\/\d{4}-/.test(sourceUrl) || typeof html !== 'string' || html.length > MAX_BYTES) return null;
  const objects = [];
  function flatten(value) {
    if (Array.isArray(value)) { for (const item of value) flatten(item); }
    else if (value && typeof value === 'object') { objects.push(value); if (value['@graph']) flatten(value['@graph']); }
  }
  for (const script of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    try { flatten(JSON.parse(script[1])); } catch { /* unparseable structured data is not evidence */ }
  }
  for (const article of objects) {
    if (![article['@type']].flat().includes('NewsArticle')) continue;
    const articleUrl = canonicalUrl(typeof article.mainEntityOfPage === 'string' ? article.mainEntityOfPage : article.mainEntityOfPage?.['@id'], undefined, ABC_HOSTS);
    if (articleUrl !== sourceUrl) continue;
    const publishedAt = sourceDate(article.datePublished);
    const title = plainText(article.headline || '');
    const body = plainText(article.description || '');
    if (!title || title.split(/\s+/).length > 24 || !body || !inLastDays(publishedAt, now, 3) || !NT_NEWS.test(`${title} ${body} ${article.keywords || ''}`)) continue;
    // Skip syndicated wire articles; do not copy text or images from those services.
    const authors = [article.author].flat().filter(Boolean);
    if (!authors.length || authors.some(author => /\b(?:Reuters|AAP|AFP|APTN|CNN|BBC|Associated Press)\b/i.test(author.name || '') || !canonicalUrl(author.url, undefined, ABC_HOSTS))) continue;
    return { type: 'news', title, excerpt: excerpt(body, title), sourceUrl, sourceName: source.name, sourceId: source.id, publishedAt, location: 'Northern Territory', evidence: { type: 'publisher-structured-data', checkedAt: now.toISOString(), originalDateField: 'datePublished', excerptOnly: true } };
  }
  return null;
}

async function mapBounded(items, limit, run) {
  const results = new Array(items.length); let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => { for (;;) { const i = index++; if (i >= items.length) break; results[i] = await run(items[i], i); } }));
  return results;
}

/**
 * types selects categories. sourceIds optionally selects IDs from the fixed
 * registry; external URLs cannot be supplied. diagnostics distinguishes empty,
 * failed and partial sources. Never treat a failed source as successful coverage.
 */
export async function collectVerifiedContent({ types = ['news', 'jobs', 'events'], sourceIds, now = new Date(), fetchImpl = globalThis.fetch, limitPerSource = 8, timeoutMs = 12000, budgetMs = 45000 } = {}) {
  now = validNow(now);
  if (!Array.isArray(types) || types.some(type => !['news', 'jobs', 'events'].includes(type))) throw new Error('invalid_content_types');
  if (sourceIds && (!Array.isArray(sourceIds) || sourceIds.some(id => !SOURCE_REGISTRY.some(source => source.id === id)))) throw new Error('unknown_source_id');
  if (!Number.isInteger(limitPerSource) || limitPerSource < 1 || limitPerSource > 12) throw new Error('invalid_source_limit');
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || !Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 120000) throw new Error('invalid_source_timeout');
  const deadline = Date.now() + budgetMs;
  const result = { jobs: [], events: [], news: [], diagnostics: [] };
  const sources = SOURCE_REGISTRY.filter(source => types.includes(source.type) && (!sourceIds || sourceIds.includes(source.id)));
  const sourceResults = await mapBounded(sources, 3, async source => {
    const items = []; const errors = []; let candidates = 0; let truncated = false;
    const get = async (url, allowedHosts) => safeFetchText(url, { fetchImpl, allowedHosts, timeoutMs, deadline });
    try {
      const response = await get(source.url, source.type === 'jobs' ? SMART_HOSTS : source.adapter === 'abc' ? ABC_HOSTS : COUNCIL_HOSTS);
      if (source.type === 'jobs') {
        const list = JSON.parse(response.text);
        if (!Array.isArray(list.content) || typeof list.totalFound !== 'number' || list.content.length > 100) throw new Error('job_listing_schema_changed');
        truncated = list.totalFound > list.content.length;
        const eligible = list.content.filter(item => item.visibility === 'PUBLIC' && item.company?.identifier === source.company && /^\d{1,24}$/.test(String(item.id)) && ntLocation(item.location) && inLastDays(sourceDate(item.releasedDate), now, 30)).sort((a, b) => Date.parse(b.releasedDate) - Date.parse(a.releasedDate));
        candidates = eligible.length; truncated ||= eligible.length > limitPerSource;
        const records = await mapBounded(eligible.slice(0, limitPerSource), 2, async listing => {
          // Construct only the documented read-only detail path, never follow an untrusted ref.
          const detailUrl = `${SMART_API}${source.company}/postings/${listing.id}`;
          try {
            const detailResponse = await get(detailUrl, SMART_HOSTS);
            return parseSmartRecruitersJob(JSON.parse(detailResponse.text), { listing, source, now, listingUrl: response.url, detailUrl });
          } catch (error) { errors.push(String(error.message).slice(0, 160)); return null; }
        });
        items.push(...records.filter(Boolean));
      } else if (source.type === 'events') {
        const urls = parseDarwinEventLinks(response.text, { now, limit: limitPerSource }); candidates = urls.length;
        const records = await mapBounded(urls, 2, async url => {
          try { const detail = await get(url, COUNCIL_HOSTS); return parseDarwinEvent(detail.text, { sourceUrl: detail.url, now, source }); }
          catch (error) { errors.push(String(error.message).slice(0, 160)); return null; }
        });
        items.push(...records.filter(Boolean));
      } else if (source.adapter === 'abc') {
        const urls = parseAbcNewsLinks(response.text, { now, limit: limitPerSource }); candidates = urls.length;
        const records = await mapBounded(urls, 2, async url => {
          try { const detail = await get(url, ABC_HOSTS); return parseAbcNews(detail.text, { sourceUrl: detail.url, now, source }); }
          catch (error) { errors.push(String(error.message).slice(0, 160)); return null; }
        });
        items.push(...records.filter(Boolean));
      } else { items.push(...parseDarwinNews(response.text, { now, limit: limitPerSource, source })); candidates = items.length; }
      return { items, diagnostic: { sourceId: source.id, type: source.type, sourceUrl: source.url, status: errors.length ? (items.length ? 'partial' : 'failed') : items.length ? 'ok' : 'empty', count: items.length, candidates, rejected: Math.max(0, candidates - items.length), truncated, checkedAt: now.toISOString(), errors: [...new Set(errors)] } };
    } catch (error) {
      return { items, diagnostic: { sourceId: source.id, type: source.type, sourceUrl: source.url, status: 'failed', count: 0, checkedAt: now.toISOString(), errors: [String(error.message).slice(0, 160)] } };
    }
  });
  for (const source of sourceResults) { result[source.diagnostic.type].push(...source.items); result.diagnostics.push(source.diagnostic); }
  for (const type of ['jobs', 'events', 'news']) {
    result[type] = [...new Map(result[type].map(item => [item.sourceUrl, item])).values()];
    result[type].sort((a, b) => type === 'events' ? Date.parse(a.startAt) - Date.parse(b.startAt) : Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  }
  return result;
}
