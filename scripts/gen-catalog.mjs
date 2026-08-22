// pocoo.vaked.dev — SOTA catalog generator (sync, no promises)
// Scans demos/book/*.html, extracts title + hanzi seal, computes SHA-256
// + size, and builds demos/book/index.html with a WASM-powered search.
// The search runs on the ternary-quant core (BitNet b1.58 {-1,0,+1}):
// the query and the titles are hashed into ternary vectors, and the
// ranking is a ternary_dot — the same core that drives dream.vaked.dev.
import { readdirSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOK_DIR = path.join(ROOT, "demos", "book");
const WASM_SRC = path.join(ROOT, "..", "dream.vaked.dev", "wasm", "ternary.wasm");
const WASM_DST = path.join(BOOK_DIR, "wasm", "ternary.wasm");

function titleFrom(html) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  if (!m) return "Untitled";
  return m[1].replace(/\s*·\s*Vének Tanácsa.*$/i, "").trim();
}

function sealFrom(html) {
  const m = html.match(/class="sigil">([^<]+)</);
  return m ? m[1].trim() : "";
}

function sha256(buf) {
  return createHash("sha256").update(buf).digest("hex");
}

// hash a string into a ternary vector {-1,0,+1} of length n
function ternVec(s, n) {
  const out = new Int8Array(n);
  const h = createHash("sha256").update(s).digest();
  for (let i = 0; i < n; i++) {
    out[i] = (h[i] % 3) - 1; // 0,1,2 -> -1,0,+1
  }
  return out;
}

const files = readdirSync(BOOK_DIR)
  .filter((f) => f.endsWith(".html") && f !== "index.html")
  .sort((a, b) => a.localeCompare(b, "hu"));

const works = files.map((f) => {
  const buf = readFileSync(path.join(BOOK_DIR, f));
  const html = buf.toString("utf8");
  const title = titleFrom(html);
  const seal = sealFrom(html);
  const hash = sha256(buf).slice(0, 12);
  const size = (buf.length / 1024).toFixed(0);
  const sealTxt = seal ? ` · ${seal}` : "";
  return `      <div class="work" data-title="${title}" data-seal="${seal}"><h3>${title}${sealTxt}</h3><div class="links"><a href="${f}">html</a></div><div class="meta">${size} KB · sha256 ${hash}…</div></div>`;
});

// copy the WASM core
mkdirSync(path.join(BOOK_DIR, "wasm"), { recursive: true });
try {
  copyFileSync(WASM_SRC, WASM_DST);
} catch (e) {
  console.warn("wasm copy skipped:", e.message);
}

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>peter's soul — books · poems · philosophy</title>
<style>
  body { background:#160b2e; color:#e8e8ff; font-family:Georgia,serif; margin:0; padding:48px 24px; }
  h1 { text-align:center; font-weight:600; letter-spacing:4px; color:#ffd15c; font-size:1.6rem; }
  .sub { text-align:center; color:#9a9ac8; font-family:monospace; margin:4px 0 24px; }
  .search { display:block; width:100%; max-width:500px; margin:0 auto 32px; padding:12px 16px;
    background:#0d0d16; border:1px solid #2b2b45; border-radius:12px; color:#e8e8ff;
    font-family:monospace; font-size:0.95rem; }
  .search:focus { outline:none; border-color:#00d4ff; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; max-width:1100px; margin:0 auto; }
  .work { border:1px solid #2b2b45; border-radius:12px; padding:16px 18px; background:#0d0d16; }
  .work.hidden { display:none; }
  .work h3 { margin:0 0 8px; font-size:1.05rem; color:#c9c9e8; }
  .links a { color:#00d4ff; text-decoration:none; margin-right:10px; font-family:monospace; font-size:0.9rem; }
  .links a:hover { text-decoration:underline; }
  .meta { color:#6a6a9a; font-family:monospace; font-size:0.75rem; margin-top:8px; }
  footer { text-align:center; color:#4a4a72; font-family:monospace; margin-top:48px; }
</style></head>
<body>
  <h1>peter's soul</h1>
  <div class="sub">books · poems · philosophy · ${works.length} works · wasm ternary search</div>
  <input class="search" id="q" type="text" placeholder="search the library… (ternary-quant core)">
  <div class="grid" id="grid">
${works.join("\n")}
  </div>
  <footer>the constellation · 0 + 1 · fine touch from within · vaked.dev</footer>
<script>
// WASM ternary-quant search: the query and titles are hashed into
// {-1,0,+1} vectors; the ranking is a ternary_dot on the WASM core.
(function () {
  "use strict";
  var N = 16;
  var titles = Array.prototype.map.call(document.querySelectorAll(".work"), function (w) {
    return { el: w, title: w.getAttribute("data-title") || "" };
  });
  var wasm = null, mem = null;
  function ternVec(s) {
    var out = new Int8Array(N);
    var h = new Uint8Array(32);
    // FNV-1a seeded per position — deterministic, no crypto needed
    for (var i = 0; i < N; i++) {
      var x = 2166136261 >>> 0;
      var str = s + ":" + i;
      for (var j = 0; j < str.length; j++) {
        x ^= str.charCodeAt(j);
        x = Math.imul(x, 16777619) >>> 0;
      }
      out[i] = (x % 3) - 1;
    }
    return out;
  }
  function rank(q, title) {
    if (!wasm) return 0;
    var qv = ternVec(q), tv = ternVec(title);
    var wp = 0, ip = N;
    for (var i = 0; i < N; i++) { mem[wp + i] = qv[i]; mem[ip + i] = tv[i]; }
    return wasm.exports.ternary_dot(wp, ip, N);
  }
  fetch("wasm/ternary.wasm").then(function (r) { return r.arrayBuffer(); }).then(function (b) {
    return WebAssembly.instantiate(b, {});
  }).then(function (res) {
    wasm = res.instance;
    mem = new Int32Array(wasm.exports.memory.buffer);
  }).catch(function () { /* search falls back to substring */ });
  var q = document.getElementById("q");
  q.addEventListener("input", function () {
    var query = q.value.trim().toLowerCase();
    titles.forEach(function (t) {
      if (!query) { t.el.classList.remove("hidden"); return; }
      var dot = wasm ? rank(query, t.title.toLowerCase()) : 0;
      var sub = t.title.toLowerCase().indexOf(query) !== -1;
      t.el.classList.toggle("hidden", !sub && dot <= 0);
    });
  });
})();
</script>
</body></html>
`;

writeFileSync(path.join(BOOK_DIR, "index.html"), html);
console.log(`catalog: ${works.length} works + wasm search → demos/book/index.html`);
