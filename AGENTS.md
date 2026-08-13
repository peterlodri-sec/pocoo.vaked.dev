# AGENTS.md — `pocoo.vaked.dev`

> **Static blog at pocoo.vaked.dev** — custom Node builder (`build.mjs`) → `dist/` → Cloudflare Pages (git integration on `main`).

## Publish pipeline (draft → live post)

Posts are long-form markdown in `posts/YYYY-MM-DD-slug.md`. The source drafts
for the Qwave performance series live in the separate `qwave` repo at
`blog-drafts/`; publishing means transforming a draft into a `posts/` file.

1. **Frontmatter** (exact keys the builder reads):
   ```yaml
   ---
   title: "Title Case Title"
   date: 2026-08-13
   description: "One-or-two-sentence summary (used for og:description, RSS, index)."
   tags: [swift, performance, ...]
   draft: false
   ---
   ```
   Drop `status`/`measured_on`/`corrections`; fold that nuance into the body.
2. **Body** starts `# Sentence-case title` then the byline, then `---`:
   `*qwave · <topic> · fine touch from within · vaked.dev*`
3. **Image paths are absolute and always live in `assets/qwave/`:**
   `![alt](/assets/qwave/<file>.svg)` — never a relative `assets/…`, never a
   filesystem path. Copy the SVG into `assets/qwave/` and validate with
   `xmllint --noout`.
4. **Cross-links to sister posts use `/posts/<slug>.html`**, not `.md` and not
   GitHub blob URLs.
5. **Build + deploy:**
   ```bash
   npm run build          # renders dist/, prints "N post(s), 0 draft(s) skipped"
   git add posts/ assets/ && git commit -m "post: …" && git push origin main
   ```
   Cloudflare Pages rebuilds on push to `main` (~20–30 s). Verify each
   `/posts/<slug>.html` returns 200.

## Illustrations (entheai)

Generated SVGs come from the entheai engine via the `vaked` provider — see the
global `entheai-bridge` skill ("Image / SVG generation") for the working
endpoint, the `deepseek/deepseek-v3.2` model choice, and the recurring
Google-Fonts `@import` XML-invalidity fix. Hand-polish layout after generation.

## Conventions

- `markdown-it` is configured with `html: false` — no raw HTML in posts; use
  markdown image syntax for SVGs.
- Posts are sorted by `date` (then filename); multiple posts may share a date.
- **Commit promptly.** This repo and `qwave` have concurrent agents working the
  same files; uncommitted work is at risk of being clobbered by a `git reset`/`pull`.
