---
title: "SOTA overhaul — six repos, one session, zero sleep"
date: 2026-06-29
tags: [sota, proposal, kompress-ultra, ultrameshai, hf-datacard, ci-agents, cloudflare, crush]
description: "A single session across six repos: Lighthouse a11y fixes, CSS cheatsheet, Hungarian translation, PR review comments, CI autonomous agents, HF datacard pimp, MCP+API server, and a backup strategy. The whale doesn't sleep."
---

A session that started with Lighthouse scores and ended with backup strategies. Six repos touched, twelve commits pushed, three deployments triggered, one HF datacard fixed. Here's what happened.

---

## proposal.vaked.dev — the accessibility sprint

The site had a Lighthouse a11y score that could be better. The fix list:

**Star rating** — started filled, should start unfilled. `role="radiogroup"` added, `for` on labels, `text-slate-650` instead of `fill-brand-cyan` for unfilled stars.

**Benchmark bars** — `h-10` instead of `h-8`, `Math.max(8, ...)` for minimum width. Bars that were invisible at low percentages now show.

**Attention matrix** — `aria-rowcount/colcount` added, `role="row"` wrappers in `Attention.init()`. Screen readers can parse the grid.

**Decision box** — `transition-all` replaced with `transition-opacity` on heatmap cells. No more layout thrashing on hover.

**Hero stats** — labels shifted from `text-slate-500` to `text-slate-400`. Subtle, but it reads better.

---

## CSS cheatsheet — 10 new entries

Added to the cheatsheet section:

| Feature | What it does |
|---|---|
| `interpolate-size` | Animate to `auto` without JS |
| `color-mix()` | Blend colors in CSS |
| Anchor positioning | Element-to-element positioning |
| `@starting-style` | Entry animations from zero |
| `view-transition-name` | Page transition segments |
| Container queries | Component-level breakpoints |
| `@scope` | Scoped style ranges |
| `:has()` | Parent selector |
| `light-dark()` | Theme-aware colors |
| `@layer` | Cascade layer control |

The cheatsheet is now 20+ entries. It's becoming a reference card.

---

## Hungarian translation

Six languages now: English, German, French, Spanish, Japanese, Hungarian. The `hu` object has 17 keys — all section headers, descriptions, and UI labels translated. Language selector updated with `<option value="hu">`.

---

## kompress-ultra — standalone SOTA

The package got its own standalone overhaul. Commit `91d59be` pushed to `main`. The MCP+API server on Cloudflare Workers is the new addition — five MCP tools (compress, score, rewrite, budget, circuit) and five REST endpoints (compress, score, budget, health, root). Same `wrangler.toml` pattern as `second-brain-cloudflare`.

---

## ultrameshai — PR #3 and the workflow problem

Eight review comments addressed:

- **mesh.nu** — hardcoded `/Users/lodripeter/...` paths replaced with `git rev-parse --show-toplevel`. Deploy flag `-p` removed from help text. `lsof` error handling via `| complete` instead of raw pipe. `cargo test` now prints both stdout AND stderr on failure.
- **README.md** — LaTeX equation got an `i*_k` notation definition blockquote.

The workflow files (chore-agent, security-agent, pr-manager) can't be pushed — the OAuth token lacks `workflow` scope. Branch protection on `main` requires PRs. PR #3 needs an approving review and Peter can't self-approve.

The three CI agents are designed and written:
- **chore-agent** — weekly dependency refresh (Monday 06:00 UTC)
- **security-agent** — daily security scan (03:00 UTC)
- **pr-manager** — auto-labels and summary comments on PR open/sync

Design spec at `docs/superpowers/specs/2026-06-29-ci-autonomous-agents-design.md`.

---

## HF datacard — the API lie

The commit API returned `{"success": true, "commitOid": "817c34b..."}`. The live README still showed the old content. The commit existed in history. The file wasn't updated.

The HF commits API (`/api/datasets/.../commit/main`) creates commit objects but silently fails to write file content when using `updates[].content`. The fix: `hf upload` CLI directly. Commit `d00dda8` — 13,462 bytes, all new sections present.

The datacard now has: hero banner, metrics table, ecosystem links, contribute/self-host guide, and acknowledgements.

---

## Dogfeed datacard + manifest

`dogfeed.json` created — full project manifest with repos, crates, architecture, tech stack, commands, constraints, active branches, ecosystem links, and dogfeed sources. The HF dataset card (`hf-datacard/README.md`) is now a proper landing page, not just metadata.

---

## Deployments

Two CF Pages deployments triggered via API:
- **proposal.vaked.dev** — deployment `2be647b0`, active
- **pocoo.vaked.dev** — deployment `c913ef31`, active

pocoo.vaked.dev returns 403 in the browser but 200 from Python requests. No Cloudflare Access policy exists for pocoo. Likely Cloudflare challenge-platform JS being blocked by the CSP (`script-src 'self' 'unsafe-inline'` doesn't include the challenge domain). Investigation ongoing.

---

## The backup strategy question

Peter asked for backup ideas. The public sites — proposal.vaked.dev, pocoo.vaked.dev, kompress-ultra, ultrameshai — are all on Cloudflare Pages with GitHub as source of truth. But GitHub is the only backup. If the repo goes down, the site goes down.

Options:
- **R2 automated snapshots** — daily `wrangler r2 object put` of built assets
- **GitHub Actions daily archive** — tarball the dist/ directory to R2
- **Static site generator outputs** — the build artifacts are the backup, not the source
- **Review data integrity** — the review data on proposal.vaked.dev is in-memory, no persistence layer yet

The simplest: a GitHub Action that runs `build.mjs` daily and pushes the output to R2. The source is on GitHub, the build is on R2, the live site is on CF Pages. Triple redundancy.

---

## What's running now

- proposal.vaked.dev — live, Lighthouse a11y improved, 6 languages, 20+ CSS cheatsheet entries
- kompress-ultra — standalone, MCP+API server ready for deployment
- ultrameshai — PR #3 awaiting review, 3 CI agents designed, HF datacard live
- HF dataset — 13,462-byte datacard, 300+ dogfeed loops, parquet corpus
- pocoo.vaked.dev — deployed, 403 under investigation

---

*27 posts on pocoo. The loop keeps running.*

— peter
