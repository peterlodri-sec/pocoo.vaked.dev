// pocoo.vaked.dev — catalog generator, WASM-powered
// The per-book markup (title + seal) is rendered by WebAssembly
// (gen-catalog.wasm); the host appends links + meta and assembles the page.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOK_DIR = path.join(ROOT, "demos", "book");

function titleFrom(html) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  if (!m) return "Untitled";
  return m[1].replace(/\s*·\s*Vének Tanácsa.*$/i, "").trim();
}
function sealFrom(html) {
  const m = html.match(/class="sigil">([^<]+)</);
  return m ? m[1].trim() : "";
}
function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }

const files = readdirSync(BOOK_DIR)
  .filter((f) => f.endsWith(".html") && f !== "index.html")
  .sort((a, b) => a.localeCompare(b, "hu"));

const books = files.map((f) => {
  const buf = readFileSync(path.join(BOOK_DIR, f));
  const html = buf.toString("utf8");
  return { file: f.replace(/\.html$/, ""), title: titleFrom(html), seal: sealFrom(html),
    hash: sha256(buf).slice(0, 12), size: (buf.length / 1024).toFixed(0) };
});

const wasmBin = readFileSync(path.join(ROOT, "scripts", "gen-catalog.wasm"));
const { instance } = await WebAssembly.instantiate(wasmBin, {});
const { render_book, memory } = instance.exports;
const mem = new Uint8Array(memory.buffer);

const ENTRY = 2000, TITLE = 1000, SEAL = 1100, OUT = 3000;
const entries = new Int32Array(memory.buffer, ENTRY, books.length * 4);
let titlePtr = TITLE, sealPtr = SEAL, outPtr = OUT;
const rendered = [];
for (let i = 0; i < books.length; i++) {
  const b = books[i];
  const tb = Buffer.from(b.title, "utf8");
  const sb = Buffer.from(b.seal, "utf8");
  mem.set(tb, titlePtr); mem.set(sb, sealPtr);
  entries[i * 4] = titlePtr; entries[i * 4 + 1] = tb.length;
  entries[i * 4 + 2] = sealPtr; entries[i * 4 + 3] = sb.length;
  titlePtr += 256; sealPtr += 64;
  const end = render_book(outPtr, ENTRY + i * 16);
  const head = Buffer.from(mem.slice(outPtr, end)).toString("utf8");
  const tail = `<div class="links"><a href="${b.file}">html</a></div><div class="meta">${b.size} KB · sha256 ${b.hash}…</div></div>`;
  rendered.push(head + tail);
  outPtr = end;
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
  <div class="sub">books · poems · philosophy · ${books.length} works · wasm-rendered catalog</div>
  <input class="search" id="q" type="text" placeholder="search the library… (ternary-quant core)">
  <div class="grid" id="grid">
${rendered.join("\n")}
  </div>
  <footer>the constellation · 0 + 1 · fine touch from within · vaked.dev</footer>
<script>
(function () {
  "use strict";
  var N = 16, wasm = null, mem = null;
  var titles = Array.prototype.map.call(document.querySelectorAll(".work"), function (w) {
    return { el: w, title: w.getAttribute("data-title") || "" };
  });
  function ternVec(s) {
    var out = new Int8Array(N);
    for (var i = 0; i < N; i++) {
      var x = 2166136261 >>> 0, str = s + ":" + i;
      for (var j = 0; j < str.length; j++) { x ^= str.charCodeAt(j); x = Math.imul(x, 16777619) >>> 0; }
      out[i] = (x % 3) - 1;
    }
    return out;
  }
  function rank(q, title) {
    if (!wasm) return 0;
    var qv = ternVec(q), tv = ternVec(title), wp = 0, ip = N;
    for (var i = 0; i < N; i++) { mem[wp + i] = qv[i]; mem[ip + i] = tv[i]; }
    return wasm.exports.ternary_dot(wp, ip, N);
  }
  fetch("wasm/ternary.wasm").then(function (r) { return r.arrayBuffer(); }).then(function (b) {
    return WebAssembly.instantiate(b, {});
  }).then(function (res) { wasm = res.instance; mem = new Int32Array(wasm.exports.memory.buffer); })
    .catch(function () {});
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
console.log(`catalog: ${books.length} works, WASM-rendered → demos/book/index.html`);
