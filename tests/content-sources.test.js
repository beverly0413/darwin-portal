import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_REGISTRY, canonicalUrl, sourceDate, plainText, safeFetchText, parseSmartRecruitersJob, parseDarwinEvent, parseDarwinEventLinks, parseDarwinNews, parseAbcNewsLinks, parseAbcNews, collectVerifiedContent } from '../api/_content-sources.js';

// Synthetic fixtures only. No fixture is used as live production content.
const NOW = new Date('2026-09-30T07:30:00Z');
const SODEXO = SOURCE_REGISTRY.find(s => s.id === 'sodexo-darwin');
const COUNCIL = 'https://www.darwin.nt.gov.au';
const EVENT_URL = `${COUNCIL}/explore/whats-on/test-workshop`;
const field = (name, text) => `<div class="field field--name-${name}">${text}</div>`;
const dates = (start = '2026-10-01T14:30:00+09:30', end = '2026-10-01T15:30:00+09:30') => field('field-date-smart', `<div class="field__item"><time datetime="${start}">Start</time><time datetime="${end}">End</time></div>`);
const event = ({ title = 'Test workshop', organizer = 'City of Darwin Libraries', location = 'Casuarina Library, NT, Australia', start, end, body = 'Learn practical skills in a free workshop.', extraDates = '' } = {}) => `<div class="node node--type-event node--view-mode-full">${field('node-title', `<h1>${title}</h1>`)}${field('field-organisation', organizer)}${field('field-event-location', location)}${dates(start, end)}${extraDates}${field('body', `<p>${body}</p>`)}</div>`;
const card = ({ title = 'Test workshop', url = '/explore/whats-on/test-workshop', start, end } = {}) => `<div class="node node--type-event node--view-mode-card-view">${field('node-title', `<h3><a href="${url}">${title}</a></h3>`)}${dates(start, end)}</div>`;
const news = ({ date = 'Posted 29th Sep 2026', url = '/council/news-media/test-news', body = 'Council will improve local facilities.', title = 'Council project' } = {}) => `<div class="node node--type-article node--view-mode-card-view">${field('node-title', `<h3><a href="${url}">${title}</a></h3>`)}${field('body', `<p>${body}</p>`)}${field('field-publish-date', date)}</div>`;
const job = (patch = {}) => ({ id: '123456', name: 'Chef', company: { identifier: 'Sodexo', name: 'Sodexo' }, visibility: 'PUBLIC', releasedDate: '2026-09-25T06:27:09.612Z', location: { city: 'Darwin', region: 'NT', country: 'au', fullLocation: 'Darwin, NT, Australia' }, postingUrl: 'https://jobs.smartrecruiters.com/Sodexo/123456-chef', applyUrl: 'https://jobs.smartrecruiters.com/Sodexo/123456-chef?oga=true', jobAd: { sections: { jobDescription: { text: '<p>Join our kitchen team.</p>' } } }, ...patch });
const options = detail => ({ listing: structuredClone(detail), source: SODEXO, now: NOW, detailUrl: 'https://api.smartrecruiters.com/v1/companies/Sodexo/postings/123456' });
const response = (body, status = 200, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': typeof body === 'string' ? 'text/html' : 'application/json', ...headers } });

test('canonical URLs strip tracking only and reject non-public or credential-bearing URLs', () => {
  assert.equal(canonicalUrl('/news?utm_source=x&page=2#top', COUNCIL), `${COUNCIL}/news?page=2`);
  assert.equal(canonicalUrl('https://jobs.smartrecruiters.com/Sodexo/123-chef?oga=true'), 'https://jobs.smartrecruiters.com/Sodexo/123-chef?oga=true');
  for (const value of ['javascript:alert(1)', 'http://example.com', 'https://localhost/a', 'https://127.0.0.1/a', 'https://[::1]/a', 'https://user:password@example.com/a', 'https://example.com:8080/a', 'https://example.com\\@evil.com/a', 'https://a.local/a']) assert.equal(canonicalUrl(value), null, value);
  assert.equal(canonicalUrl('https://evil.example/a', undefined, ['www.darwin.nt.gov.au']), null);
});

test('source dates validate calendar days, require explicit datetime zones and interpret NT dates', () => {
  assert.equal(sourceDate('2026-09-30'), '2026-09-29T14:30:00.000Z');
  assert.equal(sourceDate('2026-10-01T14:30:00+09:30'), '2026-10-01T05:00:00.000Z');
  for (const value of ['2026-02-30', '2026-13-01', '2026-09-31', '2026-09-30T14:00:00', '2026-09-30T24:00:00Z', '2026-09-30T12:61:00Z', 'September 30 2026', '0024-01-24', undefined]) assert.equal(sourceDate(value), null, value);
});

test('HTML parser removes scripts and supports nesting, entities and quoted attributes', () => {
  assert.equal(plainText('<script>secret()</script><p title="a > b">One &amp; <b>two</b></p><style>hidden</style>'), 'One & two');
  assert.equal(plainText('&#x1f600; &apos;'), "😀 '");
});

test('job needs fresh original date, live list membership and matching public detail', () => {
  const detail = job(); const result = parseSmartRecruitersJob(detail, options(detail));
  assert.equal(result.publishedAt, detail.releasedDate);
  assert.equal(result.evidence.activeListing, true);
  assert.equal(result.evidence.checkedAt, NOW.toISOString());
  assert.equal(result.employer, 'Sodexo');
  assert.equal(result.expiresAt, null);
  assert.equal(result.applyUrl, detail.applyUrl);
  assert.equal(parseSmartRecruitersJob(detail, { ...options(detail), listing: null }), null);
  assert.equal(parseSmartRecruitersJob(detail, { ...options(detail), listing: job({ id: 'different' }) }), null);
  assert.equal(parseSmartRecruitersJob(detail, { ...options(detail), listing: job({ visibility: 'INTERNAL' }) }), null);
  assert.equal(parseSmartRecruitersJob(detail, { ...options(detail), listing: job({ releasedDate: '2026-09-24T00:00:00Z' }) }), null);
});

test('jobs reject old/future/absent dates, closed roles, other locations and wrong apply destinations', () => {
  const patches = [
    { releasedDate: '2026-08-29T00:00:00Z' }, { releasedDate: '2026-10-01T00:00:00Z' }, { releasedDate: null },
    { validThrough: '2026-09-29T00:00:00Z' }, { validThrough: 'not-a-date' },
    { visibility: 'INTERNAL' }, { company: { identifier: 'Other', name: 'Other' } },
    { location: { city: 'Darwin', region: 'California', country: 'us' } },
    { location: { city: 'Sydney', region: 'NSW', country: 'au' } },
    { applyUrl: 'https://evil.example/apply' }, { applyUrl: 'https://jobs.smartrecruiters.com/Sodexo/999999-other' },
    { jobAd: { sections: { jobDescription: { text: 'This position has been filled.' } } } },
    { jobAd: {} }, { name: '' },
  ];
  for (const patch of patches) { const detail = job(patch); assert.equal(parseSmartRecruitersJob(detail, options(detail)), null, JSON.stringify(patch)); }
});

test('30-day job boundary is exact and a still-valid employer deadline is retained', () => {
  const detail = job({ releasedDate: new Date(NOW - 30 * 86400000).toISOString(), validThrough: '2026-10-10T17:00:00+09:30' });
  assert.equal(parseSmartRecruitersJob(detail, options(detail)).expiresAt, '2026-10-10T07:30:00.000Z');
  const old = job({ releasedDate: new Date(NOW - 30 * 86400000 - 1).toISOString() });
  assert.equal(parseSmartRecruitersJob(old, options(old)), null);
});

test('events require organizer, local place and true start/end times; never invent publication date', () => {
  const result = parseDarwinEvent(event(), { sourceUrl: EVENT_URL, now: NOW });
  assert.equal(result.organizer, 'City of Darwin Libraries');
  assert.equal(result.startAt, '2026-10-01T05:00:00.000Z');
  assert.equal(result.endAt, '2026-10-01T06:00:00.000Z');
  assert.equal(result.publishedAt, null);
  assert.equal(result.status, 'scheduled');
  for (const patch of [{ organizer: '' }, { location: 'Sydney NSW' }, { body: '' }, { title: 'Cancelled workshop' }, { end: '2026-09-29T15:00:00+09:30' }, { end: '' }, { end: '2027-10-01T15:00:00+09:30' }]) assert.equal(parseDarwinEvent(event(patch), { sourceUrl: EVENT_URL, now: NOW }), null, JSON.stringify(patch));
  assert.equal(parseDarwinEvent(event(), { sourceUrl: 'https://evil.example/event', now: NOW }), null);
});

test('recurring events pick the next non-ended occurrence and ignore calendar action links', () => {
  const html = event({ start: '2026-09-29T14:30:00+09:30', end: '2026-09-29T15:30:00+09:30', extraDates: dates('2026-10-02T14:30:00+09:30', '2026-10-02T15:30:00+09:30') });
  // A single actual field normally contains all occurrences.
  const combined = html.replace('</div></div><div class="field field--name-field-date-smart">', '</div>');
  const result = parseDarwinEvent(combined, { sourceUrl: EVENT_URL, now: NOW });
  assert.equal(result?.startAt, '2026-10-02T05:00:00.000Z');
  assert.deepEqual(parseDarwinEventLinks(`${card()}${card()}<a href="https://calendar.google.com/calendar/render?action=TEMPLATE">Add event</a>${card({url:'https://evil.example/event'})}${card({url:'/explore/whats-on/past',start:'2026-09-29T14:30:00+09:30',end:'2026-09-29T15:30:00+09:30'})}`, { now: NOW }), [EVENT_URL]);
});

test('news preserves publisher date and extracts bounded real text; no missing-date fallbacks', () => {
  const html = news() + news({ date: 'Posted 1st Aug 2026' }) + news({ date: '' }) + news({ date: 'Posted 2nd Oct 2026' }) + news({ date: 'Posted 31st Sep 2026' }) + news({ url: 'https://evil.example/news' });
  const result = parseDarwinNews(html, { now: NOW });
  assert.equal(result.length, 1);
  assert.equal(result[0].publishedAt, '2026-09-28T14:30:00.000Z');
  assert.equal(result[0].excerpt, 'Council will improve local facilities.');
  assert.equal(result[0].evidence.excerptOnly, true);
  const long = parseDarwinNews(news({body:'word '.repeat(200)}), {now:NOW})[0];
  assert.equal(long.excerpt.split(/\s+/).length + long.title.split(/\s+/).length, 25);
  assert.throws(() => parseDarwinNews('<html>Bot challenge</html>', {now:NOW}), /markup_changed/);
});

test('safe fetch is GET-only, manual redirects, bounded bytes and exact allowed hosts', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({url,init}); return response('OK'); };
  assert.equal((await safeFetchText(`${COUNCIL}/news`, {fetchImpl, allowedHosts:['www.darwin.nt.gov.au']})).text, 'OK');
  assert.equal(calls[0].init.method, 'GET'); assert.equal(calls[0].init.redirect, 'manual');
  await assert.rejects(() => safeFetchText('https://evil.example/news', {fetchImpl,allowedHosts:['www.darwin.nt.gov.au']}), /unsafe_source/);
  await assert.rejects(() => safeFetchText(`${COUNCIL}/news`, {fetchImpl:async()=>response('',302,{location:'https://127.0.0.1/'}),allowedHosts:['www.darwin.nt.gov.au']}), /unsafe_or_excessive_redirect/);
  await assert.rejects(() => safeFetchText(`${COUNCIL}/news`, {fetchImpl:async()=>response('123456'),maxBytes:5,allowedHosts:['www.darwin.nt.gov.au']}), /source_too_large/);
  await assert.rejects(() => safeFetchText(`${COUNCIL}/news`, {fetchImpl:async()=>response('binary',200,{'content-type':'application/zip'}),allowedHosts:['www.darwin.nt.gov.au']}), /unsupported_content_type/);
  await assert.rejects(() => safeFetchText(`${COUNCIL}/news`, {fetchImpl:async()=>response('Forbidden',403),allowedHosts:['www.darwin.nt.gov.au']}), /source_http_403/);
});

test('collector only calls selected category and reports failure rather than fabricating content', async () => {
  const calls=[];
  const result=await collectVerifiedContent({types:['news'],sourceIds:['darwin-council-news'],now:NOW,fetchImpl:async(url)=>{calls.push(url);return response(news());}});
  assert.deepEqual(calls,[`${COUNCIL}/news`]); assert.equal(result.news.length,1);assert.deepEqual(result.jobs,[]);assert.deepEqual(result.events,[]);
  const failed=await collectVerifiedContent({types:['news'],sourceIds:['darwin-council-news'],now:NOW,fetchImpl:async()=>response('Forbidden',403)});
  assert.deepEqual(failed.news,[]);assert.equal(failed.diagnostics[0].status,'failed');
  await assert.rejects(()=>collectVerifiedContent({sourceIds:['unverified-source']}), /unknown_source_id/);
});

test('collector enforces current source membership, detail checking and per-source cap', async () => {
  const detail=job(); const tooOld=job({id:'765432',releasedDate:'2026-08-01T00:00:00Z'});const calls=[];
  const result=await collectVerifiedContent({types:['jobs'],sourceIds:[SODEXO.id],now:NOW,limitPerSource:1,fetchImpl:async(url)=>{calls.push(url);return response(url===SODEXO.url?{totalFound:2,content:[detail,tooOld]}:detail);}});
  assert.equal(result.jobs.length,1); assert.equal(calls.length,2);
  assert.equal(calls[1],'https://api.smartrecruiters.com/v1/companies/Sodexo/postings/123456');
  assert.equal(result.jobs[0].evidence.detailUrl,calls[1]);
  const missing=await collectVerifiedContent({types:['jobs'],sourceIds:[SODEXO.id],now:NOW,fetchImpl:async(url)=>response(url===SODEXO.url?{totalFound:1,content:[detail]}:'gone',url===SODEXO.url?200:404)});
  assert.equal(missing.jobs.length,0);assert.equal(missing.diagnostics[0].status,'failed');
});


test('ABC checks original publication instead of modified date, NT relevance and wire authorship', () => {
  const url = 'https://www.abc.net.au/news/2026-09-30/darwin-project/107204820';
  const article = { '@type':'NewsArticle', headline:'Darwin project announced', description:'The project will improve access for residents in Darwin.', datePublished:'2026-09-29T23:38:11+00:00', dateModified:'2026-09-30T03:29:27+00:00', mainEntityOfPage:url, author:[{name:'Example reporter',url:'https://www.abc.net.au/news/example-reporter/123456'}] };
  const render = value => `<script type="application/ld+json">${JSON.stringify({'@graph':[value]})}</script>`;
  const listing = `<article data-component="DetailCard"><h3><a href="${url}">Darwin project announced</a></h3><p>Darwin residents</p><time datetime="2026-09-30T03:29:27+00:00">today</time></article>`;
  assert.deepEqual(parseAbcNewsLinks(listing,{now:NOW}),[url]);
  assert.equal(parseAbcNews(render(article),{sourceUrl:url,now:NOW}).publishedAt,'2026-09-29T23:38:11.000Z');
  assert.equal(parseAbcNews(render({...article,datePublished:'2026-09-01T00:00:00Z'}),{sourceUrl:url,now:NOW}),null);
  assert.equal(parseAbcNews(render({...article,author:[{name:'Reuters'}]}),{sourceUrl:url,now:NOW}),null);
  assert.equal(parseAbcNews(render({...article,mainEntityOfPage:'https://evil.example/article'}),{sourceUrl:url,now:NOW}),null);
  assert.equal(parseAbcNews(render({...article,headline:'Sydney project announced',description:'Sydney residents'}),{sourceUrl:url,now:NOW}),null);
});

test('safe fetch never follows a same-host mutating destination', async () => {
  await assert.rejects(() => safeFetchText(`${COUNCIL}/news`, {fetchImpl:async()=>response('',302,{location:'/user/logout'}),allowedHosts:['www.darwin.nt.gov.au']}), /unsafe_or_excessive_redirect/);
  await assert.rejects(() => safeFetchText(`${COUNCIL}/explore/whats-on/test-workshop?action=delete`, {fetchImpl:async()=>response('OK'),allowedHosts:['www.darwin.nt.gov.au']}), /unsafe_source/);
});


test('request timeouts and total budget expiry stop source work', async () => {
  const stalled = (url, {signal}) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('request_aborted')), {once:true}));
  await assert.rejects(() => safeFetchText(`${COUNCIL}/news`, {fetchImpl:stalled,timeoutMs:5,allowedHosts:['www.darwin.nt.gov.au']}), /request_aborted/);
  await assert.rejects(() => safeFetchText(`${COUNCIL}/news`, {fetchImpl:async()=>response('OK'),deadline:Date.now()-1,allowedHosts:['www.darwin.nt.gov.au']}), /source_deadline_exceeded/);
});
