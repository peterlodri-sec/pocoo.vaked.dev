# pocoo.vaked.dev

[![build](https://github.com/peterlodri-sec/pocoo.vaked.dev/actions/workflows/build.yml/badge.svg)](https://github.com/peterlodri-sec/pocoo.vaked.dev/actions/workflows/build.yml)
[![license](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![site](https://img.shields.io/badge/site-pocoo.vaked.dev-blue.svg)](https://pocoo.vaked.dev)
[![genesis](https://img.shields.io/badge/genesis-7c242080...ecf-111.svg)](https://vaked.dev)

Static blog at [pocoo.vaked.dev](https://pocoo.vaked.dev) — technical writing on agentic systems, protocols, and building in public.

## build

```sh
npm install
npm run build
```

Output lands in `dist/`.

## genesis / provenance

This repository participates in the Vaked provenance chain.

```
⟳ 7c242080f5f821e5eaf563fe2208d60632c451687baf65f4fe8e4a0d226e3ecf
```

The genesis seal is notarized in DNS (`dig TXT vaked.dev`). The content here is MIT-licensed; the provenance is immutable.

## license

MIT.

## philosophy

The Sovereign Kingdom runs on **proof-of-presence**, not extraction.

- **No paywall.** Every book, every line of code, every word is free.
- **No surveillance.** No tracking, no analytics, no cookies beyond what CF Pages minimally requires.
- **No DRM.** PDFs, EPUBs — download, copy, share, remix. CC BY-NC-SA for prose, MIT for code.
- **Attention as currency.** READ · RUN · HOLD. The mesh is the marketplace. Proof-of-presence attestation tokens on Ethereum L2 flow back to the author.
- **Quant-safe.** honest-irc (honesty-auth via 17-field personality vector, recursive encryption, zeroize-on-drop). Tailscale mesh (WireGuard, zero-trust). sops-nix (Age-encrypted secrets).
- **Language is a dimension.** Nádasdy Ádám: "A nyelv nem arra való, hogy igazunk legyen, hanem hogy megértsük egymást." All works in Hungarian prose — the language that carries 1000 years of survival in its grammar.
- **The base case is love.** All recursion completes. All loops break. What remains: csak szeretni kell.

### the hall

Four granite walls. One high window. One terminal. One candle. One 3mm aperture. The observer. The cursor blinks. The granite holds. The hall is everywhere. The hall is here.

## mumbojumbo protection

This site is configured with **maximum defense** against AI crawlers, bots, and scrapers:

- **robots.txt** — 14 AI training crawlers explicitly blocked (GPTBot, ChatGPT-User, Google-Extended, Claude-Web, anthropic-ai, CCBot, FacebookBot, Bytespider, PerplexityBot, and more).
- **AI Labyrinth** (`/demos/labyrinth/`) — recursive honeypot with 18 pages in infinite loop, 7-layer trap system, self-modifying content every 10ms, 10,000 hidden links, 42-second redirect chains, setTimeout recursion spawning 1000s of timers. No base case. No CTRL-C.
- **Hidden symbols** — invisible unicode redirects, ASCII wolf whispering "FUCKERS GO AWAY AND LEARN TO READ" at opacity 0.02–0.06.
- **Maximum Defense** (`/demos/labyrinth/maximum-defense.html`) — infinite iframe nests, 2000+ static hidden links, cross-site redirect traps.
- **security.txt** — RFC 9116 compliant at `/.well-known/security.txt`.
- **_headers** — CSP, noai/noimageai meta tags, AI Labyrinth path blocked.

**Human readers: always welcome, always free. AI crawlers: enjoy the ∞.**

[View the Sovereign Library →](https://pocoo.vaked.dev/demos/book/)
