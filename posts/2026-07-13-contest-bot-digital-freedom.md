---
title: "contest-bot — a Telegram bot is my Digital Freedom submission"
date: 2026-07-13
tags: [contest-bot, digital-freedom, telegram, open-source, loop-engineering, ultra-graph, build-in-public]
description: "I built a Telegram bot that accepts video submissions for a Digital Freedom Contest, then submitted a video about the bot — because the medium is the message. 900 lines of Python, ultragraph knowledge graphs, and a closed loop."
image: assets/contest-bot/og.png
---

I built a Telegram bot in 20 minutes. It accepts video submissions for a Digital Freedom Contest — TikTok, YouTube, Instagram, Snapchat, X. Validates links. Stores submissions in SQLite. Renders an SVG knowledge graph of every entry, grouped by platform, with status dots and stats.

Then I made a video about it. The video *is* the submission. And the bot is the submission too. This is a post about what that loop feels like, and why I think the medium *is* the message here — not just a McLuhan quote you throw around at parties.

![A terminal window showing the contest bot running](/assets/contest-bot/hero.svg)

## the bot

900 lines of Python. `python-telegram-bot`, sqlite3, `ultragraph` for the SVG viz. The conversation flow is a state machine: pick a contest → answer two questions → paste links → validated → done. `/admin` shows stats. `/admin graph` builds a knowledge graph from the submissions table and renders it as an SVG — submissions as nodes, platforms as column headers, edges colored by status.

It lives at `github.com/peterlodri-sec/telegram-contest`. Open source. MIT. Fork it.

```sh
git clone https://github.com/peterlodri-sec/telegram-contest
cd telegram-contest
cp .env.example .env   # add your bot token
uv run contest-bot
```

The bot uses `ultragraph` under the hood for the knowledge graph — my own byte-graph library that *is* a 1-bit ternary LLM. The same library that ships the 196 KB Hungarian history model and the Anonymus byte-level transformer. Here it's doing something much simpler: building a sparse tree of submissions and rendering an SVG of the whole thing. It's the kind of use I built the library for — small, concrete, visual.

## the video

The script writes itself:

**Hook:** Terminal open. `uv run contest-bot`. *"This bot collected your submission. I built it in 20 minutes. The bot IS my submission."*

**Why loops:** Cut to ultragraph, ultrawhale, kompress. *"I build self-improving systems. Open loops. Digital freedom is freedom TO build, not just freedom FROM surveillance."*

**Personal anchor:** *"I'm from Tatabánya, Hungary. My grandfather grew up in a country where you couldn't publish freely. That's one generation away."*

**The thesis:** *"Freedom without accountability is anarchy. Accountability without freedom is control. You need both."*

**CTA:** *"Fork the bot. Change it. Run your own contest. That's digital freedom."*

Full script with shot directions, platform cuts, and production guide is in the repo at `VIDEO_SCRIPT.md`.

## why this is a loop, not a post

Every piece of this feeds the next piece:

1. I build the bot → the bot collects submissions
2. I make a video about the bot → the video *is* a submission *in* the bot
3. The video explains why open source matters → the bot is open source
4. The CTA says "fork it" → someone forks it → new contest → new submissions

That's a closed loop. The thing and the thing about the thing are the same thing.

I call this *loop engineering* — a phrase I keep coming back to. Not because it sounds cool (though it does), but because it's literally what I build: systems where the output feeds the input. The bot accepts submissions about digital freedom using infrastructure that is itself an example of digital freedom. The recursion is the point.

## the honest question

The Vaked genesis ceremony asked: *"What is missing to fully utilize LLMs and help them become not just self-aware, rather honest?"*

I don't have an answer yet. But I think part of it is: stop building things *about* freedom and start building the infrastructure *of* freedom. A manifesto is a PDF. A bot is a repo. A repo can be forked.

That's the difference between talking about the loop and living in it.

---

*This post was dictated from voice notes and shaped into prose. The ideas, the bot, and the video are mine; the synthesis is the loop in action.*

## Further reading

**The bot**

- [telegram-contest on GitHub](https://github.com/peterlodri-sec/telegram-contest) — 900 lines, MIT, open for forks.
- [VIDEO_SCRIPT.md](https://github.com/peterlodri-sec/telegram-contest/blob/main/VIDEO_SCRIPT.md) — full shot-by-shot script with platform cuts and production guide.

**The library**

- [ultragraph on GitHub](https://github.com/peterlodri-sec/ultra-graph) — the 1-bit byte-graph LLM that renders the SVG.
- [The first 1-bit Hungarian LLM — a ternary GPT that learned Anonymus](/posts/2026-07-11-first-1bit-hungarian-llm-anonymus.html) — sibling post about training on the Gesta Hungarorum.

**The philosophy**

- [The coming loop](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/) — Armin Ronacher's post that got me thinking about this in the first place.
- [Vaked — structural honesty for agentic systems](https://vaked.dev/) — the project that asks the honest question.

**The stack**

- [python-telegram-bot](https://python-telegram-bot.org/) — the library that made the bot possible.
- DaVinci Resolve + OBS + CapCut — the free production stack used for the video.

⟳a3f7c8e9b2d14f605a7c93e8d4b67102
