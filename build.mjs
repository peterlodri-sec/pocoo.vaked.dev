// pocoo.vaked.dev — static blog builder
// Forked from crabcc.app-blog/build.mjs; dropped _ds, added RSS + telemetry.
// Run: node build.mjs

import { readdir, readFile, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
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

// ── Content hash + animation ─────────────────────────────────────────────────
// The pulse period is derived from the post's content hash.
// Every post pulses at a different rate — the hash determines the rhythm.
// Visible in the corner: the animation IS the loop demo.
function contentHash(text) {
  return createHash("sha256").update(text).digest("hex");
}

function hashToPeriod(hex) {
  // map first 4 hex chars (0–65535) → 18–42 seconds
  const n = parseInt(hex.slice(0, 4), 16);
  return (18 + (n / 65535) * 24).toFixed(1);
}

function hashToHue(hex) {
  // map chars 4–8 → 180–220 deg (cyan-blue range, stays on brand)
  const n = parseInt(hex.slice(4, 8), 16);
  return Math.round(180 + (n / 65535) * 40);
}

function ambientScript(hash, isPost) {
  if (!isPost) return "";
  const period = hashToPeriod(hash);
  const hue = hashToHue(hash);
  const seed = parseInt(hash.slice(8, 12), 16); // per-post ring variation
  return `<style>
@keyframes poc-pulse {
  0%,100% { opacity:.28; transform:scale(1); }
  50%      { opacity:.55; transform:scale(1.06); }
}
body::before {
  content:'';
  position:fixed;inset:0;pointer-events:none;z-index:0;
  background:
    radial-gradient(ellipse at 18% 38%, hsl(${hue},100%,55%,0.06), transparent 55%),
    radial-gradient(ellipse at 82% 62%, hsl(${(hue+40)%360},80%,55%,0.04), transparent 55%);
  animation: poc-pulse ${period}s ease-in-out infinite;
}
main,footer { position:relative; z-index:1; }
#bg-canvas { position:fixed;inset:0;pointer-events:none;z-index:0;opacity:0.18; }
</style>
<canvas id="bg-canvas"></canvas>
<script>
(function(){
  var c=document.getElementById('bg-canvas');
  if(!c||!c.getContext)return;
  var ctx=c.getContext('2d');
  var W,H,t=0;
  var seed=${seed};
  var period=${period};
  function resize(){W=c.width=innerWidth;H=c.height=innerHeight;}
  resize();
  window.addEventListener('resize',resize);
  var rings=[
    {r:Math.min(W,H)*0.22+(seed%30),hue:${hue},speed:0.18},
    {r:Math.min(W,H)*0.36+(seed%20),hue:${(hue+40)%360},speed:0.11},
    {r:Math.min(W,H)*0.50+(seed%40),hue:${hue},speed:0.07},
  ];
  function frame(){
    ctx.clearRect(0,0,W,H);
    t+=0.004;
    rings.forEach(function(ring,i){
      var pulse=Math.sin(t*ring.speed*Math.PI*2+i)*0.15+0.85;
      var r=ring.r*pulse;
      var cx=W/2,cy=H/2;
      ctx.beginPath();
      ctx.arc(cx,cy,r,0,Math.PI*2);
      ctx.strokeStyle='hsl('+ring.hue+',90%,60%)';
      ctx.lineWidth=0.5;
      ctx.globalAlpha=0.35*(Math.sin(t*ring.speed+i)+1)/2+0.15;
      ctx.stroke();
    });
    requestAnimationFrame(frame);
  }
  frame();
})();
</script>`;
}

function indexWaveScript() {
  return `<style>
#bg-canvas{position:fixed;inset:0;pointer-events:none;z-index:0;}
main,footer{position:relative;z-index:1;}
</style>
<canvas id="bg-canvas"></canvas>
<script>
(function(){
  var c=document.getElementById('bg-canvas');
  if(!c||!c.getContext)return;
  var ctx=c.getContext('2d');
  var W,H,t=0;
  function resize(){W=c.width=innerWidth;H=c.height=innerHeight;}
  resize();
  window.addEventListener('resize',resize);
  var waves=[
    {freq:0.008,amp:0.12,speed:0.35,phase:0,    color:'0,212,255',  alpha:0.12},
    {freq:0.006,amp:0.09,speed:0.22,phase:2.1,  color:'0,230,96',   alpha:0.08},
    {freq:0.010,amp:0.07,speed:0.48,phase:4.3,  color:'180,139,255',alpha:0.07},
  ];
  function frame(){
    ctx.clearRect(0,0,W,H);
    t+=0.012;
    waves.forEach(function(w){
      ctx.beginPath();
      var y0=H*0.62;
      ctx.moveTo(0,y0);
      for(var x=0;x<=W;x+=3){
        var y=y0+Math.sin(x*w.freq+t*w.speed+w.phase)*H*w.amp;
        ctx.lineTo(x,y);
      }
      ctx.lineTo(W,H);ctx.lineTo(0,H);ctx.closePath();
      var grad=ctx.createLinearGradient(0,y0-H*w.amp,0,H);
      grad.addColorStop(0,'rgba('+w.color+','+w.alpha+')');
      grad.addColorStop(1,'rgba('+w.color+',0)');
      ctx.fillStyle=grad;
      ctx.fill();
      // top stroke line
      ctx.beginPath();
      ctx.moveTo(0,y0);
      for(var x=0;x<=W;x+=3){
        var y=y0+Math.sin(x*w.freq+t*w.speed+w.phase)*H*w.amp;
        ctx.lineTo(x,y);
      }
      ctx.strokeStyle='rgba('+w.color+','+(w.alpha*2.5)+')';
      ctx.lineWidth=1;
      ctx.stroke();
    });
    requestAnimationFrame(frame);
  }
  frame();
})();
</script>`;
}

function sealFragment(hash, isPost) {
  if (!isPost) return "";
  const short = hash.slice(0, 32);
  const period = hashToPeriod(hash);
  return `<div class="post-seal" title="content-hash · period ${period}s">
  <span class="seal-icon">⟳</span><span class="seal-hash">${short}</span>
</div>`;
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

const SITE_URL = "https://pocoo.vaked.dev";
const SITE_NAME = "pocoo";
const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/og-default.png`;

// ── <head> ────────────────────────────────────────────────────────────────────
function head({ title, description, prefix, ogType, canonicalUrl, ogImage, pubDate, author }) {
  const desc = esc(description || "");
  const img = ogImage || DEFAULT_OG_IMAGE;
  const canonical = canonicalUrl || SITE_URL;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${desc}">
<link rel="canonical" href="${canonical}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:url" content="${canonical}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${desc}">
<meta property="og:image" content="${img}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:locale" content="en_US">
${ogType === "article" && pubDate ? `<meta property="article:published_time" content="${pubDate}">` : ""}
${ogType === "article" && author ? `<meta property="article:author" content="${author}">` : ""}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@peetpedro">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${desc}">
<meta name="twitter:image" content="${img}">
<meta name="theme-color" content="#070b16">
<link rel="icon" type="image/svg+xml" href="${prefix}assets/logo.svg">
<link rel="icon" type="image/png" sizes="32x32" href="${prefix}assets/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="${prefix}assets/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="${prefix}assets/icon-192.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="alternate" type="application/atom+xml" title="pocoo" href="${prefix}feed.xml">
<link rel="stylesheet" href="${prefix}assets/blog.css">
</head>`;
}

// ── Post page ─────────────────────────────────────────────────────────────────
function renderPost(post) {
  const bodyHtml = md.render(post.body);
  const hash = contentHash(post.meta.title + post.meta.date + post.body);
  const slug = post.slug;
  return `${head({
    title: `${post.meta.title} · pocoo`,
    description: post.meta.description,
    prefix: "../",
    ogType: "article",
    canonicalUrl: `${SITE_URL}/posts/${slug}.html`,
    ogImage: post.meta.image ? `${SITE_URL}/${post.meta.image}` : DEFAULT_OG_IMAGE,
    pubDate: post.meta.date ? new Date(post.meta.date).toISOString() : undefined,
    author: post.meta.author || "Lodri Péter",
  })}
<meta name="content-hash" content="${hash}">
${ambientScript(hash, true)}
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
    ${sealFragment(hash, true)}
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
    canonicalUrl: SITE_URL,
    ogImage: DEFAULT_OG_IMAGE,
  })}
${indexWaveScript()}
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

  // llms.txt — auto-updated with post list
  const postLines = posts.map((p) =>
    `- [${p.meta.title}](https://pocoo.vaked.dev/posts/${p.slug}.html): ${p.meta.description || ""}`
  ).join("\n");
  const llms = `# pocoo.vaked.dev

> Technical writing on agentic systems, compilers, protocols, and building in public. By Peter Lodri.

## Posts

${postLines}

## Feed

- [Atom feed](https://pocoo.vaked.dev/feed.xml): subscribe for updates

## Vaked ecosystem

- [protocol.vaked.dev](https://protocol.vaked.dev): AG-UI protocol spec + genesis
- [chat.vaked.dev](https://chat.vaked.dev): G0DM0D3 free-model AI chat
- [music.vaked.dev](https://music.vaked.dev): ENTHEA psychedelic visualizer
- [beat.vaked.dev](https://beat.vaked.dev): Vaked-FM swarm avatar
- [irc.vaked.dev](https://irc.vaked.dev): public IRC community (IRC)

## Dataset

- [PeetPedro/ultrawhale-dogfood](https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood): live dataset — dogfeed + telemetry

## Author

- GitHub: https://github.com/peterlodri-sec
- X: https://x.com/0xp3t3rl
- Mastodon: https://social.crabcc.app/@vakedbot
`;
  await writeFile(path.join(DIST_DIR, "llms.txt"), llms, "utf8");
  console.log("render: llms.txt");

  await cp(path.join(ROOT, "assets"), path.join(DIST_DIR, "assets"), { recursive: true });
  if (existsSync(path.join(ROOT, "_headers"))) {
    await cp(path.join(ROOT, "_headers"), path.join(DIST_DIR, "_headers"));
  }
  // Copy demos (standalone HTML, no markdown processing)
  if (existsSync(path.join(ROOT, "demos"))) {
    await cp(path.join(ROOT, "demos"), path.join(DIST_DIR, "demos"), { recursive: true });
  }
  console.log("copy: assets, _headers, demos -> dist/");
  console.log(`\ndone: ${posts.length} post(s), ${skipped} draft(s) skipped.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
