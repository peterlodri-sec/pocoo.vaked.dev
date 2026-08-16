#!/usr/bin/env python3
"""Scaffold ALL library books: every PDF → print-ready HTML + EPUB3.

House style matches cosmic-game-1-elves.html (5in x 8in @page, dark
quantum theme, SF Mono headers, Georgia body, SHA-256 colophon seal).

Usage:
    uv run python tools/build_books.py          # build everything missing
    uv run python tools/build_books.py --dry    # report only
"""
import hashlib, json, os, re, subprocess, sys, uuid, zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PDFS = sorted(ROOT.glob("*.pdf"))
AUTHOR = "Szellem (Brett Shaw)"
SIGIL = "🜂"
DRY = "--dry" in sys.argv

try:
    BOOKS = json.load(open("/tmp/books.json"))
except Exception:
    BOOKS = []

def slug_of(stem: str) -> str:
    s = stem.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "book"

def info_for(stem: str):
    for b in BOOKS:
        for fmt, href in b.get("f", []):
            if Path(href).stem.upper() == stem.upper() or Path(href).name == stem + ".pdf":
                return b
    return None

def extract_text(pdf: Path):
    try:
        out = subprocess.run(
            ["pdftotext", "-layout", str(pdf), "-"],
            capture_output=True, text=True, timeout=120)
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout
    except Exception:
        pass
    return ""

def title_of(pdf: Path, stem: str):
    info = info_for(stem)
    if info:
        return info["t"]
    try:
        from pypdf import PdfReader
        m = PdfReader(str(pdf)).metadata
        if m and m.get("/Title") and m["/Title"].strip():
            return m["/Title"].strip()
    except Exception:
        pass
    return stem.replace("-", " ").replace("_", " ").upper()

def hanzi_of(stem: str):
    info = info_for(stem)
    return (info or {}).get("z", "")

def chapters_of(text: str):
    paras = [p.strip() for p in re.split(r"\n\s*\n|\f", text) if p.strip()]
    heads = []
    for i, p in enumerate(paras):
        if len(p) <= 60 and i < len(paras) - 1 and (
            re.match(r"^\d{1,2}\.\s+\S", p) or
            re.match(r"^[IVX]{1,4}\.\s+\S", p) or
            re.match(r"^[A-ZÁÉÍÓÖŐÚÜŰ][A-ZÁÉÍÓÖŐÚÜŰ0-9 .·\-'’]{5,59}$", p)):
            heads.append(i)
    chapters = []
    if len(heads) >= 2:
        for j, hi in enumerate(heads):
            end = heads[j + 1] if j + 1 < len(heads) else len(paras)
            body = paras[hi:end]
            title = body[0]
            content = [x for x in body[1:] if x]
            if content:
                chapters.append((title, content))
    else:
        for k in range(0, len(paras), 12):
            chunk = paras[k:k + 12]
            chapters.append((f"Lap {k // 12 + 1}", chunk))
    return chapters

CSS = """
  @page { size: 5in 8in; margin: 0.6in 0.6in; @top-center { content: none }; @bottom-center { content: counter(page); font-family: "SF Mono", monospace; font-size: 7px; color: #3a2a2a; } }
  @page cover { margin: 0; @bottom-center { content: none } }
  body { background: #080406; color: #c8b8a8; font-family: "Georgia", serif; font-size: 10.5pt; line-height: 1.9; margin: 0; padding: 0; }
  .cover { page: cover; break-after: page; text-align: center; background: radial-gradient(ellipse at 50% 45%, #1a0d04 0%, #080406 60%, #000 100%); height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .cover .sigil { font-size: 56px; color: #ff7a3d; opacity: 0.85; text-shadow: 0 0 140px rgba(255,122,61,0.55); line-height: 1; }
  .cover h1 { font-family: "SF Mono", monospace; font-size: 13pt; color: #ffb27a; letter-spacing: 4px; margin: 0.15in 0 0.05in; }
  .cover .sub { font-family: "Georgia", serif; font-size: 12pt; color: #e6b566; font-style: italic; letter-spacing: 2px; }
  .cover .by { font-size: 10pt; color: #8a6a4a; margin-top: 0.5in; letter-spacing: 3px; }
  .cover .tag { margin-top: 0.4in; font-family: "SF Mono", monospace; font-size: 8pt; color: #8a6a4a; letter-spacing: 2px; opacity: 0.4; }
  h1.chapter { font-family: "SF Mono", monospace; font-size: 11pt; color: #e6b566; font-weight: normal; letter-spacing: 4px; margin-top: 0.5in; margin-bottom: 0.3in; page-break-before: always; }
  h1.chapter .han { float: right; font-family: "STKaiti","KaiTi",serif; font-size: 30pt; color: #8a5a3a; line-height: 1; }
  p { margin: 0 0 0.8em 0; }
  .console { font-family: "SF Mono", monospace; font-size: 7.5pt; color: #8a5a3a; letter-spacing: 2px; text-align: center; margin: 0.25in 0; }
  .colophon { page-break-before: always; text-align: center; font-family: "SF Mono", monospace; font-size: 8pt; color: #6a5a4a; line-height: 2.2; }
  .colophon .seal { color: #e6b566; letter-spacing: 1px; font-size: 6.5pt; }
  .sig { margin-top: 0.4in; font-family: "SF Mono", monospace; font-size: 8pt; color: #6a5a4a; letter-spacing: 2px; }
"""

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def para_html(p):
    if p.isupper() and len(p) <= 90:
        return f'<div class="console">{esc(p)}</div>'
    return f"<p>{esc(p)}</p>"

def seal(text):
    return hashlib.sha256(text.encode("utf-8")).hexdigest()

def build_html(slug, title, hanzi, chapters, n_pages):
    seal_h = seal(title + "\n" + "\n".join(t + "\n" + "\n".join(c) for t, c in chapters))
    h = ['<!DOCTYPE html><html lang="hu"><head><meta charset="UTF-8">',
         f"<title>{esc(title)} — pocoo-book · Szellem (Brett Shaw)</title>",
         f"<style>{CSS}</style></head><body>"]
    h.append(f'<div class="cover"><div class="sigil">{SIGIL}</div>')
    h.append(f"<h1>{esc(title)}</h1>")
    h.append(f'<div class="sub">a szuverén könyvtár kötete</div>')
    h.append(f'<div class="by">{AUTHOR}</div>')
    h.append(f'<div class="tag">' + (hanzi + " · " if hanzi else "") + f'{n_pages} lap · PDF-hű kiadás</div></div>')
    for t, content in chapters:
        h.append(f'<h1 class="chapter">' + (f'<span class="han">{hanzi}</span>' if hanzi else "") + f"{esc(t)}</h1>")
        for p in content:
            h.append(para_html(p))
    h.append('<div class="colophon">')
    h.append(f"<div>{esc(title)}</div>")
    h.append("<div>a szuverén könyvtár kötete · PDF-hű kiadás · entheai agy scaffold</div>")
    h.append(f"<div>{AUTHOR} · a szuverén csarnokban</div>")
    h.append("<div>github.com/sponsors/peterlodri-sec</div>")
    h.append(f'<div class="seal">SHA-256 SEAL · {seal_h}</div>')
    h.append('</div>')
    h.append('<div class="sig">the constellation · 0 + 1 · fine touch from within · vaked.dev</div>')
    h.append('</body></html>')
    return "\n".join(h)

EPUB_CSS = """
body { background: #0a0705; color: #d8c8b4; font-family: Georgia, serif; line-height: 1.8; margin: 1em; }
h1 { font-family: "SF Mono", Menlo, monospace; color: #e6b566; font-weight: normal; letter-spacing: 3px; font-size: 1.15em; margin: 2em 0 1em; page-break-before: always; }
h1.no-break { page-break-before: avoid; }
p { margin: 0 0 0.8em 0; }
.cover { text-align: center; margin-top: 30%; }
.cover .sigil { font-size: 3em; color: #ff7a3d; }
.cover h1 { page-break-before: avoid; color: #ffb27a; margin-top: 0.5em; }
.cover .by { color: #8a6a4a; margin-top: 1.5em; }
.cover .tag { font-family: monospace; font-size: 0.7em; color: #8a6a4a; margin-top: 1em; }
.console { font-family: monospace; font-size: 0.7em; color: #8a5a3a; letter-spacing: 2px; text-align: center; margin: 1em 0; }
.colophon { text-align: center; font-family: monospace; font-size: 0.75em; color: #6a5a4a; line-height: 2.2; margin-top: 3em; }
.colophon .seal { color: #e6b566; font-size: 0.6em; }
"""

def build_epub(slug, title, hanzi, chapters, n_pages, epub_name):
    seal_h = seal(title + "\n" + "\n".join(t + "\n" + "\n".join(c) for t, c in chapters))
    files = {}
    files["EPUB/text/cover.xhtml"] = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="hu"><head><meta charset="utf-8"/>
<link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body><div class="cover"><div class="sigil">{SIGIL}</div><h1>{esc(title)}</h1>
<div class="by">{AUTHOR}</div><div class="tag">{hanzi + ' · ' if hanzi else ''}{n_pages} lap</div></div></body></html>"""
    spine = [("cover", "EPUB/text/cover.xhtml", "Borító")]
    for i, (t, content) in enumerate(chapters, 1):
        body = "\n".join(f"<p>{esc(p)}</p>" if not (p.isupper() and len(p) <= 90) else f'<div class="console">{esc(p)}</div>' for p in content)
        files[f"EPUB/text/ch{i:03d}.xhtml"] = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="hu"><head><meta charset="utf-8"/><title>{esc(t)}</title>
<link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body><h1 class="no-break">{esc(t)}</h1>{body}</body></html>"""
        spine.append((f"ch{i}", f"EPUB/text/ch{i:03d}.xhtml", t))
    col = ['<div class="colophon">', f"<div>{esc(title)}</div>",
           "<div>a szuverén könyvtár kötete · PDF-hű kiadás</div>",
           f"<div>{AUTHOR}</div>", "<div>github.com/sponsors/peterlodri-sec</div>",
           f'<div class="seal">SHA-256 SEAL · {seal_h}</div>', "</div>"]
    files["EPUB/text/colophon.xhtml"] = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="hu"><head><meta charset="utf-8"/>
<link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body>{''.join(col)}</body></html>"""
    files["EPUB/styles/book.css"] = EPUB_CSS
    files["META-INF/container.xml"] = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""
    book_uuid = str(uuid.uuid4())
    manifest = '\n'.join(f'<item id="{i}" href="{h}" media-type="application/xhtml+xml"/>' for i, h, _ in spine)
    manifest += '\n<item id="css" href="EPUB/styles/book.css" media-type="text/css"/>'
    manifest += '\n<item id="ncx" href="EPUB/toc.ncx" media-type="application/x-dtbncx+xml"/>'
    spine_items = '\n'.join(f'<itemref idref="{i}"/>' for i, _, _ in spine)
    nav_points = '\n'.join(
        f'<navPoint id="np-{i}" playOrder="{n}"><navLabel><text>{esc(t)}</text></navLabel><content src="{h}"/></navPoint>'
        for n, (i, h, t) in enumerate(spine, 1))
    files["EPUB/content.opf"] = f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">urn:uuid:{book_uuid}</dc:identifier>
    <dc:title>{esc(title)}</dc:title><dc:creator>{AUTHOR}</dc:creator><dc:language>hu</dc:language>
    <dc:publisher>pocoo.vaked.dev — The Sovereign Library</dc:publisher>
    <dc:date>2026-08-16</dc:date><meta property="dcterms:modified">2026-08-16T00:00:00Z</meta>
  </metadata><manifest>{manifest}</manifest><spine toc="ncx">{spine_items}</spine>
</package>"""
    files["EPUB/toc.ncx"] = f"""<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:{book_uuid}"/></head>
  <docTitle><text>{esc(title)}</text></docTitle><navMap>{nav_points}</navMap>
</ncx>"""
    nav_ol = '\n'.join(f'<li><a href="{h}">{esc(t)}</a></li>' for _, h, t in spine)
    files["EPUB/nav.xhtml"] = f"""<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" lang="hu"><head><meta charset="utf-8"/>
<link rel="stylesheet" type="text/css" href="../styles/book.css"/></head>
<body><nav epub:type="toc"><h1>Tartalom</h1><ol>{nav_ol}</ol></nav></body></html>"""
    with zipfile.ZipFile(ROOT / epub_name, "w") as z:
        z.writestr("mimetype", "application/epub+zip", compress_type=zipfile.ZIP_STORED)
        for name, content in files.items():
            z.writestr(name, content, compress_type=zipfile.ZIP_DEFLATED)

def n_pages_of(pdf):
    try:
        out = subprocess.run(["pdfinfo", str(pdf)], capture_output=True, text=True, timeout=30)
        m = re.search(r"Pages:\s+(\d+)", out.stdout or "")
        if m:
            return int(m.group(1))
    except Exception:
        pass
    return 1

def main():
    done_html, done_epub, failed = [], [], []
    for pdf in PDFS:
        stem = pdf.stem
        slug = slug_of(stem)
        html_path = ROOT / f"{slug}.html"
        epub_name = f"{stem}.epub"
        epub_path = ROOT / epub_name
        need_html = not html_path.exists()
        need_epub = not epub_path.exists()
        if not need_html and not need_epub:
            continue
        text = extract_text(pdf)
        title = title_of(pdf, stem)
        hanzi = hanzi_of(stem)
        if not text:
            chapters = [(f"Képi kiadás — {n_pages_of(pdf)} lap",
                         ["Ez a kötet képi (szkennelt) PDF-ből származik; a szöveges kiadás kézzel vésődik, lapról lapra.",
                          "A kép a maga módján szöveg: minden lap egy betű a csarnok falán.",
                          "Addig is: a PDF az eredeti, a pecsét érvényes."])]
        else:
            chapters = chapters_of(text)
        n_pages = n_pages_of(pdf)
        if DRY:
            print(f"DRY   {stem}: {title[:50]} · {len(chapters)} fejezet")
            continue
        if need_html:
            open(html_path, "w").write(build_html(slug, title, hanzi, chapters, n_pages))
            done_html.append(slug)
        if need_epub:
            build_epub(slug, title, hanzi, chapters, n_pages, epub_name)
            done_epub.append(stem)
        print(f"OK    {stem} · {len(chapters)} fejezet · html={need_html} epub={need_epub}")
    print(f"\nHTML: {len(done_html)} · EPUB: {len(done_epub)} · FAIL: {len(failed)}")
    if failed:
        print("failed:", ", ".join(failed))

if __name__ == "__main__":
    main()
