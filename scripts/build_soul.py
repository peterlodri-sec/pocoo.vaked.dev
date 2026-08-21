#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# ///
"""
build_soul.py — Peter's soul, made machine-readable and one page.

Scans pocoo.vaked.dev/demos/book/ (his books, poems, philosophy — html, epub,
pdf variants of every work) and emits:

  MANIFEST.json   the soul manifest: every work, every format, size + sha256,
                  the provenance-capsule style the corpus uses ({id, source})
  index.html      the soul shelf: one page that links every work, grouped

Usage:
  uv run --script scripts/build_soul.py
  # writes demos/book/MANIFEST.json + demos/book/index.html
"""

import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
BOOK_DIR = HERE / "demos" / "book"
FORMATS = {".html": "html", ".epub": "epub", ".pdf": "pdf"}


def title_of(name: str) -> str:
    """Prettify a filename into a title (drop the variant suffix first)."""
    return name.replace("-", " ").replace("_", " ").title()


def work_key(name: str) -> str:
    """Group the html/epub/pdf variants of one work by their common stem."""
    stem = name
    for ext in (".html", ".epub", ".pdf"):
        if stem.lower().endswith(ext):
            stem = stem[: -len(ext)]
    return re.sub(r"[^a-z0-9]+", "", stem.lower())


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def main() -> int:
    works: dict[str, dict] = {}
    for p in sorted(BOOK_DIR.iterdir()):
        if p.is_dir() or p.suffix.lower() not in FORMATS:
            continue
        key = work_key(p.name)
        w = works.setdefault(key, {
            "id": p.name[: -len(p.suffix)].lower(),
            "title": title_of(p.stem),
            "source": "pocoo.vaked.dev/demos/book",
            "formats": {},
        })
        w["formats"][FORMATS[p.suffix.lower()]] = {
            "file": p.name,
            "bytes": p.stat().st_size,
            "sha256": sha256(p),
        }

    manifest = {"collection": "peter's soul — books · poems · philosophy",
                "count": len(works), "works": list(works.values())}
    (BOOK_DIR / "MANIFEST.json").write_text(json.dumps(manifest, indent=2))

    # the soul shelf — one HTML page, dark + ternary accents
    rows = []
    for w in works.values():
        links = " · ".join(
            f'<a href="{fmt["file"]}">{kind}</a>' for kind, fmt in sorted(w["formats"].items())
        )
        total = sum(f["bytes"] for f in w["formats"].values())
        rows.append(
            f'      <div class="work"><h3>{w["title"]}</h3>'
            f'<div class="links">{links}</div>'
            f'<div class="meta">{total/1024:.0f} KB · sha256 {next(iter(w["formats"].values()))["sha256"][:12]}…</div></div>'
        )
    html = f"""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>peter's soul — books · poems · philosophy</title>
<style>
  body {{ background:#07060d; color:#e8e8ff; font-family:Georgia,serif; margin:0; padding:48px 24px; }}
  h1 {{ text-align:center; font-weight:600; letter-spacing:4px; color:#ffd15c; font-size:1.6rem; }}
  .sub {{ text-align:center; color:#9a9ac8; font-family:monospace; margin:4px 0 40px; }}
  .grid {{ display:grid; grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); gap:16px; max-width:1100px; margin:0 auto; }}
  .work {{ border:1px solid #2b2b45; border-radius:12px; padding:16px 18px; background:#0d0d16; }}
  .work h3 {{ margin:0 0 8px; font-size:1.05rem; color:#c9c9e8; }}
  .links a {{ color:#00d4ff; text-decoration:none; margin-right:10px; font-family:monospace; font-size:0.9rem; }}
  .links a:hover {{ text-decoration:underline; }}
  .meta {{ color:#6a6a9a; font-family:monospace; font-size:0.75rem; margin-top:8px; }}
  footer {{ text-align:center; color:#4a4a72; font-family:monospace; margin-top:48px; }}
</style></head>
<body>
  <h1>peter's soul</h1>
  <div class="sub">books · poems · philosophy · {len(works)} works · MANIFEST.json provenance</div>
  <div class="grid">
{chr(10).join(rows)}
  </div>
  <footer>· vaked.dev · t3: the machine's own wire · every work its own capsule ·</footer>
</body></html>
"""
    (BOOK_DIR / "index.html").write_text(html)
    print(f"soul: {len(works)} works → demos/book/MANIFEST.json + demos/book/index.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
