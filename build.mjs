// pocoo.vaked.dev — static blog builder
// Forked from crabcc.app-blog/build.mjs; dropped _ds, added RSS + telemetry.
// Run: node build.mjs

import { readdir, readFile, mkdir, writeFile, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import MarkdownIt from "markdown-it";
// import mathjax3 from "markdown-it-mathjax3";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const POSTS_DIR = path.join(ROOT, "posts");
const DIST_DIR = path.join(ROOT, "dist");

const md = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
}).enable(["table", "fence", "code"]);

// External links open in a new tab (rel=noopener); internal links stay in-tab.
const _defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet("href") || "";
  if (/^https?:\/\//i.test(href)) {
    tokens[idx].attrSet("target", "_blank");
    tokens[idx].attrSet("rel", "noopener noreferrer");
  }
  return _defaultLinkOpen(tokens, idx, options, env, self);
};

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

// ── Mycelium + mathematical-wizardry background (2D canvas) ─────────────────
// A growing hyphal network (branching, glowing fruiting bodies) over faint
// drifting mathematical glyphs — the underground knowledge of the loop.
// Seeded per-post by content hash (each post keeps its own growth). reduced-motion → static.
function quantumBgScript(hash, isPost) {
  const seed = hash ? parseInt(hash.slice(0, 8), 16) : 123456789;
  const opacity = isPost ? "0.6" : "0.8";
  return `<style>
#bg-canvas{position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:${opacity};}
main,footer{position:relative;z-index:1;}
</style>
<canvas id="bg-canvas"></canvas>
<script>
(function(){
  var c=document.getElementById('bg-canvas'); if(!c) return;
  var ctx=c.getContext('2d'); if(!ctx) return;
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var s=${seed};
  function rnd(){ s=(s*16807)%2147483647; return (s-1)/2147483646; }
  var W,H,DPR;
  function rs(){ DPR=Math.min(2,window.devicePixelRatio||1); W=innerWidth; H=innerHeight; c.width=W*DPR; c.height=H*DPR; c.style.width=W+'px'; c.style.height=H+'px'; ctx.setTransform(DPR,0,0,DPR,0,0); }
  rs(); window.addEventListener('resize',rs);

  var GLYPHS=['∫','π','Σ','∂','√','φ','∞','λ','∇','⊕','≈','±','Δ','Ψ','∮','Φ'];
  var glyphs=[];
  for(var i=0;i<24;i++){ glyphs.push({x:rnd()*W,y:rnd()*H,sz:12+rnd()*30,a:0.02+rnd()*0.05,vx:(rnd()-0.5)*0.12,vy:(rnd()-0.5)*0.09,ch:GLYPHS[(rnd()*GLYPHS.length)|0]}); }

  var tips=[];
  function spawn(n){ for(var i=0;i<n;i++){ tips.push({x:W*(0.5+(rnd()-0.5)*0.9),y:H*(0.72+rnd()*0.4),a:-Math.PI/2+(rnd()-0.5)*1.6,life:0,max:130+rnd()*170}); } }
  spawn(26);

  var nodes=[];

  function frame(){
    ctx.fillStyle='rgba(6,10,8,0.10)'; ctx.fillRect(0,0,W,H);

    ctx.textAlign='center'; ctx.textBaseline='middle';
    for(var i=0;i<glyphs.length;i++){ var g=glyphs[i];
      g.x+=g.vx; g.y+=g.vy;
      if(g.x<-50)g.x=W+50; if(g.x>W+50)g.x=-50; if(g.y<-50)g.y=H+50; if(g.y>H+50)g.y=-50;
      ctx.fillStyle='rgba(212,175,55,'+g.a.toFixed(3)+')';
      ctx.font='500 '+g.sz+'px Georgia,"Times New Roman",serif';
      ctx.fillText(g.ch,g.x,g.y);
    }

    ctx.lineCap='round';
    for(var i=tips.length-1;i>=0;i--){ var t=tips[i];
      var nx=t.x+Math.cos(t.a)*2.2, ny=t.y+Math.sin(t.a)*2.2;
      t.a+=(rnd()-0.5)*0.7;
      ctx.strokeStyle='rgba(110,231,183,0.14)'; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(nx,ny); ctx.stroke();
      t.x=nx; t.y=ny; t.life++;
      if(rnd()<0.03 && tips.length<260){ tips.push({x:t.x,y:t.y,a:t.a+(rnd()<0.5?-0.9:0.9),life:t.life,max:t.max}); }
      if(rnd()<0.004 && nodes.length<90){ nodes.push({x:t.x,y:t.y,r:0.8,a:0.85}); }
      if(t.life>t.max || t.x<-60||t.x>W+60||t.y<-60||t.y>H+60){ tips.splice(i,1); }
    }
    if(tips.length<18) spawn(6);

    for(var j=nodes.length-1;j>=0;j--){ var nd=nodes[j];
      nd.r+=0.03; nd.a-=0.006;
      if(nd.a<=0){ nodes.splice(j,1); continue; }
      var g2=ctx.createRadialGradient(nd.x,nd.y,0,nd.x,nd.y,nd.r*7);
      g2.addColorStop(0,'rgba(230,193,90,'+nd.a.toFixed(3)+')');
      g2.addColorStop(1,'rgba(230,193,90,0)');
      ctx.fillStyle=g2; ctx.beginPath(); ctx.arc(nd.x,nd.y,nd.r*7,0,6.2832); ctx.fill();
      ctx.fillStyle='rgba(230,193,90,'+nd.a.toFixed(3)+')';
      ctx.beginPath(); ctx.arc(nd.x,nd.y,nd.r,0,6.2832); ctx.fill();
    }

    if(!reduce) requestAnimationFrame(frame);
  }
  frame();
})();
<\/script>`;
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
  const ext = (url, label) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  return `<footer class="site-footer">
  <span class="foot-eco">
  ${ext("https://vaked.dev", "vaked.dev")} ·
  ${ext("https://ocean.vaked.dev", "ocean.vaked.dev")} ·
  ${ext("https://worklog.vaked.dev", "worklog.vaked.dev")} ·
  ${ext("https://github.com/8b-is/smart-tree", "smart-tree ↗")} ·
  ${ext("https://github.com/8b-is/transformers", "transformers-ultra ↗")} ·
  ${ext("https://peterl.dev", "peterl.dev")}
  </span>
  <br>
  <a href="/">home</a> ·
  ${ext("https://github.com/peterlodri-sec", "github")} ·
  ${ext("https://x.com/0xp3t3rl", "x")} ·
  ${ext("https://music.vaked.dev", "music")} ·
  ${ext("https://store.vaked.dev", "store")} ·
  ${ext("https://art.vaked.dev", "art")} ·
  ${ext("https://axiomquant.org", "axiomquant")} ·
  ${ext("https://mlxquantlovefrom.com", "mlxquant")} ·
  <a href="/feed.xml">feed</a>
</footer>`;
}

const SITE_URL = "https://pocoo.vaked.dev";
const SITE_NAME = "pocoo";
const DEFAULT_OG_IMAGE = `${SITE_URL}/assets/og-default.png`;

// ── <head> ────────────────────────────────────────────────────────────────────
function head({ title, description, prefix, ogType, canonicalUrl, ogImage, pubDate, author, jsonLd }) {
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
<meta name="theme-color" content="#060a08">
<link rel="icon" type="image/svg+xml" href="${prefix}assets/logo.svg">
<link rel="icon" type="image/png" sizes="32x32" href="${prefix}assets/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="${prefix}assets/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="192x192" href="${prefix}assets/icon-192.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<link rel="alternate" type="application/atom+xml" title="pocoo" href="${prefix}feed.xml">
<link rel="stylesheet" href="${prefix}assets/bg.css">
<link rel="stylesheet" href="${prefix}assets/blog.css">
<script defer src="${prefix}assets/bg.js"></script>
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
</head>`;
}

// ── Post tools (copy buttons + scroll-to-top) ────────────────────────────────
function postToolsHtml(mdJson, promptJson) {
  return `<script type="application/json" id="post-md">${mdJson}</script>
<script type="application/json" id="post-prompt">${promptJson}</script>
<div class="post-tools">
  <button class="tool-btn" id="copy-md" type="button">Copy Markdown</button>
  <button class="tool-btn" id="copy-prompt" type="button">Copy as Prompt</button>
</div>
<button class="to-top" id="to-top" type="button" aria-label="Back to top">&uarr;</button>
<script>
(function(){
  function read(id){ var n=document.getElementById(id); return n ? JSON.parse(n.textContent) : ''; }
  var md = read('post-md'), prompt = read('post-prompt');
  function copy(text, btn){
    if(!btn) return;
    btn.addEventListener('click', function(){
      var done = function(){ var o=btn.textContent; btn.textContent='Copied ✓'; setTimeout(function(){ btn.textContent=o; },1500); };
      var p = navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject(new Error('no clipboard'));
      p.then(done).catch(function(){
        var ta=document.createElement('textarea'); ta.value=text; ta.style.position='fixed'; ta.style.opacity='0';
        document.body.appendChild(ta); ta.select();
        try{ document.execCommand('copy'); }catch(e){}
        document.body.removeChild(ta); done();
      });
    });
  }
  copy(md, document.getElementById('copy-md'));
  copy(prompt, document.getElementById('copy-prompt'));
  var tt=document.getElementById('to-top'), h1=document.querySelector('.post-head h1');
  if(tt && h1){
    function onScroll(){ tt.classList.toggle('visible', h1.getBoundingClientRect().bottom < 0); }
    window.addEventListener('scroll', onScroll, {passive:true}); onScroll();
    tt.addEventListener('click', function(){ window.scrollTo({top:0, behavior:'smooth'}); });
  }
})();
<\/script>`;
}

// ── Post page ─────────────────────────────────────────────────────────────────
function renderPost(post) {
  const bodyHtml = md.render(post.body);
  const hash = contentHash(post.meta.title + post.meta.date + post.body);
  const slug = post.slug;
  const mdJson = JSON.stringify(post.body).replace(/</g, "\\u003c");
  const promptForEducation = "You are an expert teacher. Teach me the content of the following blog post. Walk through it step by step, explain every technical concept in simple terms, and end with a short quiz to test my understanding.\n\n# " + post.meta.title + "\n\n" + post.body;
  const promptJson = JSON.stringify(promptForEducation).replace(/</g, "\\u003c");
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.meta.title,
    description: post.meta.description || "",
    datePublished: post.meta.date,
    dateModified: post.meta.date,
    author: { "@type": "Person", name: post.meta.author || "Lodri Péter", url: "https://peterl.dev" },
    publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
    mainEntityOfPage: `${SITE_URL}/posts/${slug}`,
    image: post.meta.image ? `${SITE_URL}/${post.meta.image}` : DEFAULT_OG_IMAGE,
  });
  return `${head({
    title: `${post.meta.title} · pocoo`,
    description: post.meta.description,
    prefix: "../",
    ogType: "article",
    canonicalUrl: `${SITE_URL}/posts/${slug}`,
    ogImage: post.meta.image ? `${SITE_URL}/${post.meta.image}` : DEFAULT_OG_IMAGE,
    pubDate: post.meta.date ? new Date(post.meta.date).toISOString() : undefined,
    author: post.meta.author || "Lodri Péter",
    jsonLd,
  })}
<meta name="content-hash" content="${hash}">
${quantumBgScript(hash, true)}
<body>
  ${footerHtml()}
  <main class="post">
    <p class="back"><a href="../index.html">&larr; all posts</a></p>
    <header class="post-head">
      <h1>${esc(post.meta.title)}</h1>
      <p class="meta"><time datetime="${esc(post.meta.date)}">${displayDate(post.meta.date)}</time></p>
      ${tagsHtml(post.meta.tags)}
    </header>
    ${postToolsHtml(mdJson, promptJson)}
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
        <h2 class="entry-title"><a href="posts/${esc(p.slug)}">${esc(p.meta.title)}</a></h2>
        <p class="meta"><time datetime="${esc(p.meta.date)}">${displayDate(p.meta.date)}</time></p>
        <p class="entry-desc">${esc(p.meta.description || "")}</p>
        ${tagsHtml(p.meta.tags)}
      </li>`).join("\n");

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description: "Technical writing on agentic systems, protocols, and building in public.",
    author: { "@type": "Person", name: "Lodri Péter", url: "https://peterl.dev" },
  });
  return `${head({
    title: "pocoo",
    description: "Technical writing on agentic systems, protocols, and building in public.",
    prefix: "",
    ogType: "website",
    canonicalUrl: SITE_URL,
    ogImage: DEFAULT_OG_IMAGE,
    jsonLd,
  })}
${quantumBgScript(null, false)}
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
    <link href="https://pocoo.vaked.dev/posts/${esc(p.slug)}"/>
    <id>https://pocoo.vaked.dev/posts/${esc(p.slug)}</id>
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

// ── Sitemap ───────────────────────────────────────────────────────────────────
function renderSitemap(posts) {
  const urls = posts.map((p) =>
    `  <url><loc>${SITE_URL}/posts/${esc(p.slug)}</loc><lastmod>${esc(p.meta.date)}</lastmod></url>`
  ).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${SITE_URL}/</loc></url>
${urls}
</urlset>`;
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

  await writeFile(path.join(DIST_DIR, "sitemap.xml"), renderSitemap(posts), "utf8");
  console.log("render: sitemap.xml");

  // llms.txt — auto-updated with post list
  const postLines = posts.map((p) =>
    `- [${p.meta.title}](https://pocoo.vaked.dev/posts/${p.slug}): ${p.meta.description || ""}`
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
  // Copy book manuscripts (standalone HTML library, no markdown processing)
  if (existsSync(path.join(ROOT, "book"))) {
    await cp(path.join(ROOT, "book"), path.join(DIST_DIR, "book"), { recursive: true });
  }
  // Copy standalone pages (no markdown processing; e.g. silicon-world/)
  if (existsSync(path.join(ROOT, "silicon-world"))) {
    await cp(path.join(ROOT, "silicon-world"), path.join(DIST_DIR, "silicon-world"), { recursive: true });
  }
  // Copy root-level config files for CF Pages
  if (existsSync(path.join(ROOT, "robots.txt"))) {
    await cp(path.join(ROOT, "robots.txt"), path.join(DIST_DIR, "robots.txt"));
  }
  if (existsSync(path.join(ROOT, ".well-known"))) {
    await cp(path.join(ROOT, ".well-known"), path.join(DIST_DIR, ".well-known"), { recursive: true });
  }
  console.log("copy: assets, _headers, demos, silicon-world, robots.txt, .well-known -> dist/");
  console.log(`\ndone: ${posts.length} post(s), ${skipped} draft(s) skipped.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
