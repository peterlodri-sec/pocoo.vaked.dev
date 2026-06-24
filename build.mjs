// pocoo.vaked.dev — static blog builder
// Forked from crabcc.app-blog/build.mjs; dropped _ds, added RSS + telemetry.
// Run: node build.mjs

import { readdir, readFile, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(ROOT, "posts");
const DIST_DIR = path.join(ROOT, "dist");

const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
}).enable(["table", "fence", "code"]);

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseFrontmatter(raw) {
  const text = raw.replace(/^﻿/, "");
  if (!text.startsWith("---")) return { meta: {}, body: text };
  const lines = text.split(/\r?\n/);
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end === -1) return { meta: {}, body: text };
  const block = lines.slice(1, end);
  const body = lines.slice(end + 1).join("\n");
  const meta = {};
  for (const line of block) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if (key === "tags") meta.tags = parseList(val);
    else if (key === "draft") meta.draft = /^true$/i.test(val);
    else meta[key] = stripQuotes(val);
  }
  return { meta, body };
}

function stripQuotes(v) {
  if ((v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

function parseList(v) {
  let s = v.trim();
  if (s.startsWith("[") && s.endsWith("]")) s = s.slice(1, -1);
  if (!s.trim()) return [];
  return s.split(",").map((x) => stripQuotes(x.trim())).filter(Boolean);
}

function slugOf(filename) {
  return filename.replace(/\.md$/i, "");
}

function displayDate(date) {
  const m = String(date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return esc(String(date || ""));
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

function tagsHtml(tags) {
  if (!tags || !tags.length) return "";
  return `<ul class="tags">${tags.map((t) => `<li class="tag">${esc(t)}</li>`).join("")}</ul>`;
}

// ── Telemetry (Tier 2 — no PII) ─────────────────────────────────────────────
// Same pattern as music.vaked.dev, irc.vaked.dev.
// Events: page_view, post_read (45s threshold, post pages only), session_end.
function telemetryScript(isPost, slug, title) {
  const slugLit = esc(slug || "index");
  const titleLit = title ? esc(title) : "";
  const readTimer = isPost
    ? `var _rf=false;setTimeout(function(){if(!_rf){_rf=true;record('post_read',{slug:'${slugLit}',read_duration_sec:45});}},45000);`
    : "";
  const slugField = isPost
    ? `slug:'${slugLit}',title:'${titleLit}'`
    : `slug:'index'`;
  return `<script>
(function(){
  var E='https://chat.vaked.dev/api/telemetry';
  var sid=crypto.randomUUID?crypto.randomUUID():(Date.now().toString(36)+'-'+Math.random().toString(36).slice(2));
  var t0=Date.now(),buf=[];
  function flush(){if(!buf.length)return;var ev=buf.splice(0);fetch(E,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({events:ev})}).catch(function(){});}
  function record(type,data){buf.push(Object.assign({type:type,timestamp:Date.now(),session_id:sid,page:'pocoo.vaked.dev'},data||{}));flush();}
  record('page_view',{${slugField}});
  ${readTimer}
  window.addEventListener('beforeunload',function(){
    record('session_end',{duration_sec:Math.round((Date.now()-t0)/1000)${isPost ? `,slug:'${slugLit}'` : ""}});
    if(buf.length)navigator.sendBeacon(E,JSON.stringify({events:buf}));
  });
})();
<\/script>`;
}

// ── Footer ───────────────────────────────────────────────────────────────────
function footerHtml() {
  return `<footer class="site-footer">
  <a href="https://github.com/peterlodri-sec">github</a> ·
  <a href="https://x.com/0xp3t3rl">x</a> ·
  <a href="https://chat.vaked.dev">chat</a> ·
  <a href="https://music.vaked.dev">music</a> ·
  <a href="https://beat.vaked.dev">beat</a> ·
  <a href="https://irc.vaked.dev">irc</a> ·
  <a href="https://protocol.vaked.dev">protocol</a> ·
  <a href="https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood">dataset</a> ·
  <a href="/feed.xml">feed</a>
</footer>`;
}

// ── <head> ────────────────────────────────────────────────────────────────────
function head({ title, description, prefix, ogType }) {
  const desc = esc(description || "");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${desc}">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${desc}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${desc}">
<meta name="theme-color" content="#070b16">
<link rel="icon" type="image/svg+xml" href="${prefix}assets/logo.svg">
<link rel="apple-touch-icon" href="${prefix}assets/logo.svg">
<link rel="alternate" type="application/atom+xml" title="pocoo" href="${prefix}feed.xml">
<link rel="stylesheet" href="${prefix}assets/blog.css">
</head>`;
}

// ── Post page ─────────────────────────────────────────────────────────────────
function renderPost(post) {
  const bodyHtml = md.render(post.body);
  return `${head({
    title: `${post.meta.title} · pocoo`,
    description: post.meta.description,
    prefix: "../",
    ogType: "article",
  })}
<body>
  ${footerHtml()}
  <main class="post">
    <p class="back"><a href="../index.html">&larr; all posts</a></p>
    <header class="post-head">
      <h1>${esc(post.meta.title)}</h1>
      <p class="meta"><time datetime="${esc(post.meta.date)}">${displayDate(post.meta.date)}</time></p>
      ${tagsHtml(post.meta.tags)}
    </header>
    <article class="prose">
${bodyHtml}
    </article>
  </main>
  ${telemetryScript(true, post.slug, post.meta.title)}
</body>
</html>`;
}

// ── Index page ────────────────────────────────────────────────────────────────
function renderIndex(posts) {
  const entries = posts.map((p) => `      <li class="entry">
        <h2 class="entry-title"><a href="posts/${esc(p.slug)}.html">${esc(p.meta.title)}</a></h2>
        <p class="meta"><time datetime="${esc(p.meta.date)}">${displayDate(p.meta.date)}</time></p>
        <p class="entry-desc">${esc(p.meta.description || "")}</p>
        ${tagsHtml(p.meta.tags)}
      </li>`).join("\n");

  return `${head({
    title: "pocoo",
    description: "Technical writing on agentic systems, protocols, and building in public.",
    prefix: "",
    ogType: "website",
  })}
<body>
  ${footerHtml()}
  <main class="index">
    <header class="index-head">
      <div class="logo-wrap"><img src="assets/logo.svg" alt="vaked" width="48" height="48"></div>
      <h1>pocoo</h1>
      <p class="lede">Technical writing on agentic systems, protocols, and building in public.</p>
    </header>
    <ul class="post-list">
${entries}
    </ul>
  </main>
  ${telemetryScript(false, null, null)}
</body>
</html>`;
}

// ── Atom feed ─────────────────────────────────────────────────────────────────
function renderFeed(posts) {
  const updated = posts.length > 0
    ? `${posts[0].meta.date}T00:00:00Z`
    : new Date().toISOString();
  const entries = posts.map((p) => `  <entry>
    <title>${esc(p.meta.title)}</title>
    <link href="https://pocoo.vaked.dev/posts/${esc(p.slug)}.html"/>
    <id>https://pocoo.vaked.dev/posts/${esc(p.slug)}.html</id>
    <updated>${esc(p.meta.date)}T00:00:00Z</updated>
    <summary type="text">${esc(p.meta.description || "")}</summary>
  </entry>`).join("\n");

  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>pocoo</title>
  <link href="https://pocoo.vaked.dev/feed.xml" rel="self" type="application/atom+xml"/>
  <link href="https://pocoo.vaked.dev/"/>
  <updated>${updated}</updated>
  <id>https://pocoo.vaked.dev/</id>
${entries}
</feed>`;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  await rm(DIST_DIR, { recursive: true, force: true });
  await mkdir(path.join(DIST_DIR, "posts"), { recursive: true });

  const files = (await readdir(POSTS_DIR))
    .filter((f) => f.toLowerCase().endsWith(".md"))
    .sort();

  const posts = [];
  let skipped = 0;
  for (const file of files) {
    const raw = await readFile(path.join(POSTS_DIR, file), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    if (meta.draft === true) { skipped++; console.log(`skip (draft): ${file}`); continue; }
    posts.push({ slug: slugOf(file), meta, body });
  }

  posts.sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)));

  for (const post of posts) {
    const html = renderPost(post);
    await writeFile(path.join(DIST_DIR, "posts", `${post.slug}.html`), html, "utf8");
    console.log(`render: posts/${post.slug}.html`);
  }

  await writeFile(path.join(DIST_DIR, "index.html"), renderIndex(posts), "utf8");
  console.log("render: index.html");

  await writeFile(path.join(DIST_DIR, "feed.xml"), renderFeed(posts), "utf8");
  console.log("render: feed.xml");

  await cp(path.join(ROOT, "assets"), path.join(DIST_DIR, "assets"), { recursive: true });
  if (existsSync(path.join(ROOT, "_headers"))) {
    await cp(path.join(ROOT, "_headers"), path.join(DIST_DIR, "_headers"));
  }
  console.log("copy: assets, _headers -> dist/");
  console.log(`\ndone: ${posts.length} post(s), ${skipped} draft(s) skipped.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
