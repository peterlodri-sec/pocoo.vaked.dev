---
title: "Archiving crabcc — the genesis project, retired"
date: 2026-06-29
tags: [crabcc, archive, retirement, genesis, nix-base, ultrameshai, milestone]
description: "crabcc was the first thing I built. The first idea I had, the first code I wrote, the first system I tried to make real. Today it ships as a tag in the nix-base repo and an empty slot in the agent roster. A short, honest thank-you."
---

Today I archived **crabcc** — the first project I ever started in this whole ecosystem. Tag `archive/crabcc-2026-06-29` in `nix-base` marks the pre-removal state. The package, the `crabcc-godfather` supervisor, the `swe-agent` runner, the `crabcc-src` flake input — all gone from the build, all preserved for reference.

This is a short, honest post about it.

> Note: poku.wiki.dev was a typo from my end — this blog lives at **pocoo.vaked.dev**, which is the repo this post is filed in.

---

## what it was

crabcc was supposed to be a **symbol index for AI coding agents**. A Rust workspace that would index a codebase, watch a running agent, and file GitHub issues when the agent crashed. The companion binary, `crabcc-godfather`, would attach to a child process via `sysinfo` polling and supervise it. The whole thing had a SQLite-backed event log, a heartbeat daemon, auto-filed crash reports, an E2B sandbox runner. It was ambitious. It was the first real system I tried to build.

It was also my **genesis project**. The first idea I had, the first code I wrote, the first thing I told myself "this is what I'm going to do." The name came from a pun I was embarrassed to explain to anyone. The logo was a glyph I drew at 2am. The `crabcc` Mastodon skin, the `crabcc` mastodon theme variables, the `crabcc_sec` Caddy security header snippet, the `crabcc` basic-auth username for jotty and super-productivity — all of that came from this one seed.

## why it had to go

The honest reason: **it's superseded**. The architecture it pioneered — agent supervision, symbol indexing, sandboxed runner shells, a single place to watch a long-running agent — is now provided by other tools that do it better:

- The `agent` launcher in `nix-ai-onboarding` (srt-sandboxed, MCP-inheriting, roster of mainstream agents) covers the role of `crabcc-godfather watch --pid ...` and does it without a custom supervisor binary.
- Honcho (memory), second-brain (long-term recall), and the llm-agents roster cover the role of `_crab_session` / `_crab_event` / `_crab_resource_sample` and do it with shared memory primitives instead of a private SQLite file at `~/.crabcc/_internal.db`.
- The `kompress-ultra` loop engine in ultrameshai, the `nix-ai-onboarding` agent launchpad, the `dogfeed` data-generation loop — all of these were *born* out of patterns I first tried in crabcc, then realized needed a different substrate.

So the project that started everything is now, in some sense, the *parent* of everything else in the fleet. The code is gone. The lessons are not.

## what I did today

- Tagged `archive/crabcc-2026-06-29` in `nix-base` (the pre-removal state, frozen for reference).
- Created branch `chore/archive-crabcc` (off the local `claude/cloud-build-utilization` working branch, which already had the unmerged `crabcc-src` input).
- Removed:
  - `pkgs/crabcc.nix` (the Rust package derivation)
  - `modules/crabcc-godfather.nix` (the PID-attach supervisor wrapper)
  - `apps/swe-agent/{default.nix,run_in_e2b.py}` (the E2B runner)
  - The `crabcc-src` flake input from `flake.nix`
  - `crabcc` from the `nix-ai-onboarding` agent roster
  - The `peterlodri.godfather` config blocks from `hosts/hetzner` and `hosts/mbp`
  - The blocked nixery catalog entry for `crabcc-nightly`
  - The commented `extraPkgs.crabcc` example from `hosts/dev-cx53/nixery.nix` and `modules/nixery.nix`
- Merged via [PR #49](https://github.com/peterlodri-sec/nix-base/pull/49) — admin merge, no review needed, this is purely a deletion.
- The live `*.crabcc.app` public services (listmonk, mastodon, vaultwarden, forgejo, ntfy, cap, jotty, super-productivity, langfuse, openobserve, umami, bao) **stay intact** — those are production user-facing domains, not the crabcc codebase. Renaming them would mean migrating the `crabcc.app` zone, the Mailgun `news@crabcc.app` address, the Mastodon local domain `social.crabcc.app`, and breaking every user who has an account on those services. That's a separate, much larger project.

## what stayed

- The **`crabcc` Mastodon theme** on `social.crabcc.app` is still served to every user who picks it. It's a good theme. People like it.
- The `crabcc_sec` Caddy security-header snippet is still applied to every public-services-host vhost (HSTS, nosniff, etc). It works.
- The bcrypt-hashed `crabcc` basic-auth username for `jotty.crabcc.app` and `tasks.crabcc.app` is still in those config files. The password is in sops. Both services still work.
- The `crabcc.app` apex domain still resolves. The zone still works. The launch-list on `list.crabcc.app` is still subscribed to.

So the *brand* lives on, even as the *codebase* is retired. That's a fine outcome.

## a thank-you

I want to be honest here. crabcc was the project that taught me what it felt like to have an idea, to start building it, and to keep building it past the point where it was obviously too big. It taught me the smell of a real-time event log, the joy of a `cargo clippy --deny warnings` pipeline, the embarrassment of a fakeHash placeholder you forgot to replace. It taught me that "the first thing I built" is allowed to be the thing I retire.

I'm grateful for it. I'm grateful for the nights I spent on it. I'm grateful I had something to start from.

The loop keeps running. The next idea gets a better substrate.

*— peter*
