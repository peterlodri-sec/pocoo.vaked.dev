// pocoo.vaked.dev — catalog generator, WASM-powered
// The per-book markup (title + seal) is rendered by WebAssembly
// (gen-catalog.wasm); the host appends links + meta and assembles the page.
//
// layout rule: title/seal/entry/out are fixed scratch regions reused per
// book — nothing advances with the book count, so buffers can never collide.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BOOK_DIR = path.join(ROOT, "demos", "book");
const MAX_SHARED_BYTES = 20 * 1024 * 1024; // build.mjs keeps dist under the CF Pages limit

function decodeEntities(s) {
  return s.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, e) =>
    ({ amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " }[e]));
}
function clean(s) {
  return decodeEntities(s.replace(/<[^>]*>/g, ""))
    .normalize("NFC")
    .replace(/[\u0000-\u001f\u007f\uFFFD]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function byteCap(s, max) {
  const enc = new TextEncoder();
  while (enc.encode(s).length > max && s.length > 0) s = s.slice(0, -8);
  return s.trim();
}
function titleFrom(html, fallback) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  let t = m ? clean(m[1]) : "";
  if (!t || /^untitled$/i.test(t)) {
    const h = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    t = h ? clean(h[1]) : "";
  }
  if (!t) t = fallback;
  return byteCap(t.replace(/\s*·\s*Vének Tanácsa.*$/i, "").trim(), 380);
}
function sealFrom(html) {
  const m = html.match(/class="sigil">([^<]+)</);
  return byteCap(m ? clean(m[1]) : "", 90);
}
function sha256(buf) { return createHash("sha256").update(buf).digest("hex"); }

const allFiles = readdirSync(BOOK_DIR);
const byLower = new Map(allFiles.map((f) => [f.toLowerCase(), f]));
const files = allFiles
  .filter((f) => f.endsWith(".html") && f !== "index.html")
  .sort((a, b) => a.localeCompare(b, "hu"));

const books = files.map((f) => {
  const buf = readFileSync(path.join(BOOK_DIR, f));
  const html = buf.toString("utf8");
  const slug = f.replace(/\.html$/, "");
  const extras = [];
  for (const ext of ["pdf", "epub"]) {
    const sibling = byLower.get(`${slug.toLowerCase()}.${ext}`);
    if (!sibling) continue;
    try {
      if (statSync(path.join(BOOK_DIR, sibling)).size > MAX_SHARED_BYTES) continue;
    } catch (e) { continue; }
    extras.push({ ext, href: encodeURI(sibling) });
  }
  if (slug === "flyxion-trilogy-i") {
    extras.push(
      { ext: "roe.pdf", href: "/papers/flyxion-trilogy-2026/relief_of_explanation.pdf" },
      { ext: "toh.pdf", href: "/papers/flyxion-trilogy-2026/terrestrial_oxygen_history.pdf" },
      { ext: "dma.pdf", href: "/papers/flyxion-trilogy-2026/distributed_material_archives.pdf" }
    );
  } else if (slug === "flyxion-trilogy-ii") {
    extras.push(
      { ext: "cms.pdf", href: "/papers/flyxion-trilogy-2026/continuous_microsurgery.pdf" },
      { ext: "sas.pdf", href: "/papers/flyxion-trilogy-2026/surveillance_after_scarcity.pdf" },
      { ext: "tct.pdf", href: "/papers/flyxion-trilogy-2026/the_charity_trap.pdf" }
    );
  } else if (slug === "flyxion-trilogy-iii") {
    extras.push(
      { ext: "pmo.pdf", href: "/papers/flyxion-trilogy-2026/trilogy-iii/programmable_material_organization.pdf" },
      { ext: "cwv.pdf", href: "/papers/flyxion-trilogy-2026/trilogy-iii/compression_without_verification.pdf" },
      { ext: "02-rna.pdf", href: "/papers/flyxion-trilogy-2026/trilogy-iii/routing_is_not_adjudication.pdf" },
      { ext: "11-iaa.pdf", href: "/papers/flyxion-trilogy-2026/trilogy-iii/inscription_and_authority.pdf" }
    );
  }
  return {
    file: slug,
    title: titleFrom(html, slug),
    seal: sealFrom(html),
    hash: sha256(buf).slice(0, 12),
    size: (buf.length / 1024).toFixed(0),
    extras,
  };
});

const wasmBin = readFileSync(path.join(ROOT, "scripts", "gen-catalog.wasm"));
const { instance } = await WebAssembly.instantiate(wasmBin, {});
const { render_book, memory } = instance.exports;
const mem = new Uint8Array(memory.buffer);

// fixed scratch regions — reused for every book (see layout rule above)
const TITLE = 1000, SEAL = 1600, ENTRY = 2000, OUT = 3000;
const rendered = [];
for (let i = 0; i < books.length; i++) {
  const b = books[i];
  const tb = Buffer.from(byteCap(esc(b.title), 560), "utf8");
  const sb = Buffer.from(byteCap(esc(b.seal), 240), "utf8");
  mem.set(tb, TITLE); mem.set(sb, SEAL);
  const entry = new Int32Array(memory.buffer, ENTRY, 4);
  entry[0] = TITLE; entry[1] = tb.length;
  entry[2] = SEAL; entry[3] = sb.length;
  const end = render_book(OUT, ENTRY);
  const head = Buffer.from(mem.slice(OUT, end)).toString("utf8");
  const links = [
    `<a href="${b.file}">html</a>`,
    ...b.extras.map((x) => `<a href="${x.href}">${x.ext}</a>`),
  ].join("");
  const tail = `<div class="links">${links}</div><div class="meta">${b.size} KB · sha256 ${b.hash}…</div></div>`;
  rendered.push(head + tail);
}

const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Sovereign Library — pocoo.vaked.dev/demos/book</title>
<meta name="description" content="The Sovereign Library — ${books.length} free works: books, poems, philosophy. Wasm-ternary search, sha256-ledgered.">
<meta property="og:title" content="The Sovereign Library — pocoo.vaked.dev/demos/book">
<meta property="og:description" content="${books.length} free works from the constellation. Fine touch from within.">
<meta property="og:image" content="/assets/og-default.png">
<style>
  :root{--bg:#1A0F1E;--card:#221430;--line:#33203A;--pink:#FF4D9D;--pink2:#FF8FAB;--gold:#C9A227;--blue:#A6C8FF;--ink:#E8E6E3;--dim:#8a6f8f}
  *{box-sizing:border-box}
  body{background:var(--bg);color:var(--ink);font-family:ui-monospace,Menlo,monospace;margin:0;padding:48px 20px 64px;
    background-image:linear-gradient(rgba(51,32,58,.35) 1px,transparent 1px),linear-gradient(90deg,rgba(51,32,58,.35) 1px,transparent 1px);
    background-size:120px 120px}
  header{max-width:1100px;margin:0 auto 26px;text-align:center}
  .eyebrow{color:var(--gold);letter-spacing:6px;font-size:.72rem;text-transform:uppercase}
  h1{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--pink);letter-spacing:4px;
    font-size:clamp(1.6rem,4vw,2.4rem);margin:10px 0 8px}
  .sub{color:var(--dim);font-size:.8rem;letter-spacing:1px}
  .start{margin:14px auto 0;font-size:.85rem;color:var(--dim)}
  .start a{color:var(--pink2);text-decoration:none;border-bottom:1px dotted var(--pink2)}
  .start a:hover{color:var(--pink)}
  .search{display:block;width:100%;max-width:500px;margin:26px auto 30px;padding:12px 16px;
    background:#120a16;border:1px solid var(--line);border-radius:12px;color:var(--ink);
    font-family:inherit;font-size:.95rem}
  .search:focus{outline:none;border-color:var(--pink)}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;max-width:1100px;margin:0 auto}
  .work{border:1px solid var(--line);border-radius:12px;padding:16px 18px;background:var(--card);transition:border-color .15s}
  .work:hover{border-color:#4a2f52}
  .work.hidden{display:none}
  .work h3{margin:0 0 8px;font-size:1.02rem;color:var(--ink);font-weight:600;line-height:1.35}
  .links a{color:var(--pink);text-decoration:none;margin-right:10px;font-size:.85rem}
  .links a:hover{text-decoration:underline}
  .meta{color:#6a5580;font-size:.72rem;margin-top:8px}
  footer{text-align:center;color:#5a4570;margin-top:52px;font-size:.78rem;line-height:1.9}
  footer .heart{color:var(--pink)}
</style></head>
<body>
  <header>
    <div class="eyebrow">⟦ pocoo · vaked.dev ⟧</div>
    <h1>THE SOVEREIGN LIBRARY</h1>
    <div class="sub">books · poems · philosophy · ${books.length} works · wasm-ternary search · sha256-ledgered</div>
    <div class="start">start here <span class="heart">♥</span> → <a href="ultralovegod-magnet">THE SOVEREIGN LIBRARY — a declaration for the architecture of truth</a></div>
    <div class="start" style="margin-top:10px;display:flex;justify-content:center;flex-wrap:wrap;gap:12px;">
      <a href="64kb-foundation" style="color:var(--pink);">64KB Foundation (Ch. 1 Free)</a> ·
      <a href="https://payhip.com/64KilobyteFoundation" target="_blank" rel="noopener noreferrer" style="color:var(--gold);">Payhip Bookstore ($2.99–$7.99)</a> ·
      <a href="https://peterlodri.substack.com" target="_blank" rel="noopener noreferrer" style="color:var(--pink2);">Substack Serial</a> ·
      <a href="https://pocoo.vaked.dev/support/" style="color:var(--blue);">Support &amp; Patronage</a>
    </div>
  </header>
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
