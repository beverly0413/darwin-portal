import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function element(tagName = "div") {
  return {
    tagName, children: [], attributes: {}, style: {}, listeners: {}, value: "", disabled: false, hidden: false,
    set textContent(value) { this.text = value; this.children = []; },
    get textContent() { return this.text || ""; },
    set innerHTML(value) { this.html = value; this.text = ""; this.children = []; },
    get innerHTML() { return this.html || ""; },
    get childElementCount() { return this.children.length; },
    setAttribute(name, value) { this.attributes[name] = value; },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(name, callback) { this.listeners[name] = callback; },
    focus() {}, remove() {}, querySelectorAll() { return this.controls || []; },
  };
}
function browser(client) {
  const nodes = Object.fromEntries(["posts", "forumListStatus", "forumRetry", "forumSearch", "forumForm", "forumStatus", "forumImages", "forumClearImages", "forumPreview", "forumTitle", "content"].map((id) => [id, element()]));
  nodes.forumForm.controls = [nodes.forumTitle, nodes.content, nodes.forumImages, nodes.forumClearImages];
  nodes.forumForm.reset = () => { nodes.forumTitle.value = ""; nodes.content.value = ""; };
  const events = {};
  const document = {
    getElementById: (id) => nodes[id] || null, createElement: element, body: element("body"),
    addEventListener(name, callback) { events[name] = callback; }, removeEventListener() {},
  };
  const context = vm.createContext({ document, window: { supabaseClient: client }, URL, Date, Intl, console: { error() {} } });
  vm.runInContext(readFileSync(new URL("../forum.js", import.meta.url), "utf8"), context);
  return { context, nodes, document, events };
}
function clientFor(response = { data: [], error: null }, options = {}) {
  const selected = [], ranges = [], writes = [];
  const client = {
    selected, ranges, writes,
    auth: { getUser: options.getUser || (async () => ({ data: { user: { id: "real-user", email: "author@example.test" } } })) },
    from(table) {
      let countQuery = false;
      const builder = {
        select(fields, settings) { selected.push({ table, fields }); countQuery = Boolean(settings?.head); return this; },
        order() { return this; }, eq() { return this; }, gte() { return this; },
        lt() { assert.ok(countQuery); return Promise.resolve(options.count || { count: 0, error: null }); },
        range(start, end) { ranges.push([start, end]); return typeof response === "function" ? response(start) : Promise.resolve(response); },
        in() { return Promise.resolve(options.profiles || { data: [], error: null }); },
        insert(payload) { writes.push({ table, payload }); return options.insert ? options.insert(payload) : Promise.resolve({ error: null }); },
        then(resolve, reject) { return Promise.resolve(options.comments || { data: [], error: null }).then(resolve, reject); },
      };
      return builder;
    },
  };
  return client;
}
function texts(node) { return [node.textContent, ...node.children.flatMap(texts)].join(" "); }
function tags(node, name) { return [...(node.tagName === name ? [node] : []), ...node.children.flatMap((child) => tags(child, name))]; }

 test("forum renders real titles and content as text, never user HTML", async () => {
  const client = clientFor({ data: [{ id: 1, title: '<img src=x onerror="bad">', content: "<script>bad()</script>", images: ['javascript:alert(1)', 'data:text/html,boom', 'https://example.test/image.png'] }], error: null });
  const { context, nodes } = browser(client);
  await context.loadForumPosts();
  assert.equal(nodes.posts.children.length, 1);
  assert.match(texts(nodes.posts), /<script>bad\(\)<\/script>/);
  assert.equal(tags(nodes.posts, "script").length, 0);
  assert.equal(tags(nodes.posts, "img").length, 1);
  assert.equal(tags(nodes.posts, "img")[0].src, "https://example.test/image.png");
  assert.equal(tags(nodes.posts, "button")[0].textContent, '<img src=x onerror="bad">');
  assert.equal(client.selected[0].fields, "id, title, content, images, created_at");
});

test("legacy posts get readable titles without rewriting their stored content", () => {
  const { context } = browser();
  assert.equal(context.forumPostTitle({ title: "Biu一下", content: "旧帖的真实第一行\n第二行" }), "旧帖的真实第一行");
  assert.equal(context.forumPostTitle({ title: " 新标题 ", content: "Body" }), "新标题");
  assert.equal(context.forumPostTitle({}), "未命名讨论");
});

test("image handling rejects executable, malformed and credential-bearing links", () => {
  const { context } = browser();
  for (const value of ["javascript:alert(1)", "data:image/svg+xml;base64,PHN2Zz4=", "data:text/html,hello", "//example.test/img", "https://user:pass@example.test/i", "https://example.test/i\n"]) assert.equal(context.safeForumImage(value), "");
  assert.equal(context.safeForumImage("data:image/png;base64,YQ=="), "data:image/png;base64,YQ==");
  assert.equal(context.safeForumImage("https://example.test/i.png"), "https://example.test/i.png");
});

test("missing client, database errors and network errors show retry rather than empty state", async () => {
  for (const client of [undefined, clientFor({ data: null, error: new Error("denied") }), clientFor(() => Promise.reject(new Error("offline")))]) {
    const { context, nodes } = browser(client);
    await context.loadForumPosts();
    assert.match(nodes.forumListStatus.textContent, /暂时无法加载/);
    assert.equal(nodes.forumRetry.hidden, false);
    assert.equal(nodes.posts.children.length, 0);
    vm.runInContext('forumSearchTerm = "Darwin"; renderForumPosts()', context);
    assert.match(nodes.forumListStatus.textContent, /暂时无法加载/);
  }
});

test("database empty and no matching search results remain distinct; keywords are plain text", async () => {
  const { context, nodes } = browser(clientFor());
  await context.loadForumPosts();
  assert.match(nodes.forumListStatus.textContent, /还没有公开讨论/);
  context.window.supabaseClient = clientFor({ data: [{ id: 1, title: "Darwin 交通", content: "公交经验" }, { id: 2, title: "Katherine", content: "本地信息" }], error: null });
  await context.loadForumPosts();
  vm.runInContext('forumSearchTerm = "DARWIN 公交"; renderForumPosts()', context);
  assert.equal(nodes.posts.children.length, 1);
  vm.runInContext('forumSearchTerm = "[script]"; renderForumPosts()', context);
  assert.equal(nodes.posts.children.length, 0);
  assert.match(nodes.forumListStatus.textContent, /没有找到匹配/);
});

test("pagination includes later posts and avoids duplicate records", async () => {
  const client = clientFor((start) => Promise.resolve({ data: start === 0 ? Array.from({ length: 100 }, (_, id) => ({ id, title: `Topic ${id}` })) : [{ id: 99, title: "Topic 99" }, { id: 100, title: "Older topic" }], error: null }));
  const { context, nodes } = browser(client);
  await context.loadForumPosts();
  assert.equal(nodes.posts.children.length, 101);
  assert.deepEqual(client.ranges, [[0, 99], [100, 199]]);
  assert.match(texts(nodes.posts), /Older topic/);
});

test("retry recovers and an older request cannot overwrite a newer result", async () => {
  let resolveOld, calls = 0;
  const { context, nodes } = browser(clientFor(() => ++calls === 1 ? new Promise((resolve) => { resolveOld = resolve; }) : Promise.resolve({ data: [{ id: 1, title: "Newest response" }], error: null })));
  const old = context.loadForumPosts();
  assert.equal(nodes.posts.attributes["aria-busy"], "true");
  await context.loadForumPosts();
  resolveOld({ data: null, error: new Error("Old failure") });
  await old;
  assert.match(texts(nodes.posts), /Newest response/);
  assert.equal(nodes.forumRetry.hidden, true);
  assert.equal(nodes.posts.attributes["aria-busy"], "false");
});

test("post submission stores typed title using only existing fields and authenticated identity", async () => {
  const client = clientFor();
  const { context, nodes } = browser(client);
  context.setupForumForm();
  nodes.forumTitle.value = " Katherine 生活提问 ";
  nodes.content.value = "真实问题";
  await nodes.forumForm.onsubmit({ preventDefault() {} });
  assert.equal(client.writes.length, 1);
  assert.equal(client.writes[0].table, "forum_posts");
  assert.deepEqual(JSON.parse(JSON.stringify(client.writes[0].payload)), { title: "Katherine 生活提问", content: "真实问题", images: [], user_id: "real-user", user_email: "author@example.test" });
  assert.equal(nodes.forumTitle.value, "");
  assert.equal(nodes.forumTitle.disabled, false);
  assert.equal(nodes.forumStatus.textContent, "讨论已发布。");
});

test("invalid or signed-out posts are not sent and retain their draft", async () => {
  const client = clientFor(undefined, { getUser: async () => ({ data: { user: null } }) });
  const { context, nodes } = browser(client);
  context.setupForumForm();
  nodes.content.value = "Draft";
  await nodes.forumForm.onsubmit({ preventDefault() {} });
  assert.match(nodes.forumStatus.textContent, /标题/);
  nodes.forumTitle.value = "Draft title";
  await nodes.forumForm.onsubmit({ preventDefault() {} });
  assert.equal(client.writes.length, 0);
  assert.equal(nodes.content.value, "Draft");
  assert.match(nodes.forumStatus.textContent, /请先登录/);
  assert.equal(nodes.content.disabled, false);
});

test("repeated submit clicks cannot duplicate a pending write, and write failure keeps the draft", async () => {
  let resolveWrite;
  const client = clientFor(undefined, { insert: () => new Promise((resolve) => { resolveWrite = resolve; }) });
  const { context, nodes } = browser(client);
  context.setupForumForm();
  nodes.forumTitle.value = "Draft title";
  nodes.content.value = "Draft";
  const first = nodes.forumForm.onsubmit({ preventDefault() {} });
  await nodes.forumForm.onsubmit({ preventDefault() {} });
  for (let index = 0; index < 5; index++) await Promise.resolve();
  assert.equal(client.writes.length, 1);
  resolveWrite({ error: new Error("offline") });
  await first;
  assert.equal(nodes.content.value, "Draft");
  assert.match(nodes.forumStatus.textContent, /未能确认.*避免重复提交/);
  assert.equal(nodes.content.disabled, false);
});

test("daily form check uses Darwin date and retains its existing three-post UX limit", async () => {
  const { context, nodes } = browser(clientFor(undefined, { count: { count: 3, error: null } }));
  const bounds = context.forumDarwinDayBounds(Date.parse("2026-09-30T15:00:00Z"));
  assert.equal(bounds.start, "2026-09-30T14:30:00.000Z");
  assert.equal(bounds.end, "2026-10-01T14:30:00.000Z");
  context.setupForumForm();
  nodes.forumTitle.value = "Draft title"; nodes.content.value = "Draft";
  await nodes.forumForm.onsubmit({ preventDefault() {} });
  assert.match(nodes.forumStatus.textContent, /当前表单每日最多提交 3 条/);
  assert.equal(nodes.content.value, "Draft");
});

test("comments keep real nicknames, use text nodes and expose retry on failure", async () => {
  const client = clientFor(undefined, { comments: { data: [{ content: "<script>comment</script>", user_id: "one" }], error: null }, profiles: { data: [{ id: "one", nickname: "<b>Nickname</b>" }], error: null } });
  const { context } = browser(client);
  const list = element(), info = element();
  await context.loadComments("post", list, info);
  assert.match(texts(list), /<b>Nickname<\/b>/);
  assert.equal(tags(list, "script").length, 0);
  assert.equal(info.textContent, "共 1 条评论");
  context.window.supabaseClient = clientFor(undefined, { comments: { data: null, error: new Error("offline") } });
  await context.loadComments("post", list, info);
  assert.match(texts(list), /评论暂时无法加载/);
  assert.equal(tags(list, "button")[0].textContent, "重试评论");
  assert.equal(info.textContent, "");
});

test("comment writes keep authentication and existing identity fields", async () => {
  const client = clientFor();
  const { context } = browser(client);
  const textarea = element("textarea"), status = element(), submit = element("button");
  textarea.value = "实际评论";
  await context.submitComment("post-id", textarea, status, element(), element(), submit);
  assert.equal(client.writes[0].table, "forum_comments");
  assert.deepEqual(JSON.parse(JSON.stringify(client.writes[0].payload)), { post_id: "post-id", content: "实际评论", user_id: "real-user", user_email: "author@example.test" });
  assert.equal(textarea.value, "");
  assert.equal(submit.disabled, false);
});

test("community HTML exposes titled form, search, retry and honest privacy guidance", () => {
  const html = readFileSync(new URL("../forum.html", import.meta.url), "utf8");
  const guidelines = readFileSync(new URL("../community-guidelines.html", import.meta.url), "utf8");
  assert.match(html, /id="forumTitle"[^>]+required/);
  assert.match(html, /id="forumSearch"/);
  assert.match(html, /id="forumListStatus" role="status"/);
  assert.match(html, /id="forumRetry"/);
  assert.match(html, /href="community-guidelines.html"/);
  assert.doesNotMatch(html, /匿名吐槽|前台不会显示是谁发的|Biu一下/);
  assert.match(guidelines, /账号 ID 和邮箱关联/);
  assert.match(guidelines, /不是完整的隐私政策/);
  assert.match(guidelines, /没有在本页提供可追踪的举报入口或承诺处理时限/);
});
