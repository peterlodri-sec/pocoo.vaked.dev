---
title: "The Chaos Overworld, Dev Diary 001 — a world is a geometry of admissible continuation"
date: 2026-09-08
description: "Lead Game Designer diary: the 8b-is engine as an executable theory — six ancestors, the actor-mesh, quant physics, and the painted forest. Links + commits."
tags: [8b-is, engine, game-design, mmo, quant-physics, dev-diary]
draft: false
---

# The Chaos Overworld, Dev Diary 001

*lead game designer · the 8b-is engine · fine touch from within · vaked.dev*

---

This is the first entry in an ongoing engineering diary for the
**8b-is engine**. I'll write it as myself — the lead game designer — not as
a changelog, but as a running account of what the thing *is* and how it
keeps becoming.

## the one line

> A persistent world is a geometry of admissible continuation, and a game
> engine is the executable model of that geometry.

That is the theory, and the engine is it, compiled. A world is not a
database of objects; it is a *space of possible states and the legal moves
between them*. Our determinism — the seed line, sha256 → trits → LCG — is
the inscription of that geometry. The rendered frame is its on-demand
projection. The doctrine "replayable ⇒ admissible" is the claim that the
space *recurs*: the same seed produces the same world, met again.

## the six ancestors

Six games donate one system each, and I keep them honest:

- **WoW** — the persistent zones, the chat matrix, the threat tables
- **Minecraft** — the interactable terrain, the voxel shell
- **Diablo** — the dense swarms, the loot, the three verbs (stomp · split · bounce)
- **Path of Exile** — the passive tree, the gem sockets, the build depth
- **Fable** — the world reacts: alignment, reputation, consequence
- **Elder Scrolls** — open world, skill-by-doing, radiant quests, deep lore

And the look is a fifth voice: **Neva**'s painted watercolor forests over
PoE's grimdark stakes, with WoW's readable silhouettes. Grief and hope, in
a painted forest, with a god bleeding through.

## what shipped this week

- **[8b-is-engine](https://github.com/8b-is/8b-is-engine)** — the public
  repo, now on the `8b-is` org. `v0.1.0` tagged.
- The **actor-mesh EventBus** — NATS + tokio + Go channels + protobuf,
  the Erlang/OTP shape without the god-process. See
  [`eventbus-actor-mesh.md`](https://github.com/8b-is/8b-is-engine/blob/main/docs/eventbus-actor-mesh.md).
- The **world-model game design** — six ancestors + the 8b-is AGNOS stack
  (prakash light, tanmatra elements, jantu creatures, bhava emotion).
  [`game-design.md`](https://github.com/8b-is/8b-is-engine/blob/main/docs/game-design.md).
- The **backyard-ultra floor** — loop survival, last-one-standing.
  Play it: [`pocoo.vaked.dev/demos/centerfugeq/backyard-ultra-floor.html`](https://pocoo.vaked.dev/demos/centerfugeq/backyard-ultra-floor.html).
- The **first walk tutorial** — an interactive role-playing primer, like
  the old tabletop tutorials.
- **CC0 asset packs** vendored (Kenney tilesets/sprites/audio), LFS-tracked,
  credited in `CREDITS.md`.

## the commits that matter

| Commit | What |
|---|---|
| `e4bf0e8` | the game studio doc — business lane, EOS-CLA |
| `2e4b5f2` | engine design v2 — the serverless overworld |
| `50b8de8` | the actor-mesh EventBus + visual direction |
| `3e1cde1` | vendored CC0 asset packs + engine goal v1 |
| `bd045bc` | recorded Flyxion's preservation conditions + Mind Games |

## what I'm reading into the engine next

Two papers just landed and they *name* what we're doing:

1. **Flyxion's "Inscription Before Rendering"** — four conditions of
   preservation: Provenance, Reachability, Redundancy, **Recurrence**. The
   last is the one everyone misses: a record must be *encountered again*,
   not just retrievable. Our replay is recurrence.
2. **Ullman et al.'s "Mind Games"** — the brain is a physics engine: objects
   + events, sleeping/waking bodies, a cheap body distinct from the rendered
   shape, and a room of hacks that look right without being exact. That is
   centerfugeq's quant physics, verbatim.

## the next version

The goal states itself plainly now: **a usable rendering engine, quant
physics at the core, and an indie game that ships** — interoperating with
Unreal (Uika), Unity (Cloud SDK), and Blender (the scene-builder) rather
than reinventing them. The seed renders everywhere; the engines are just
surfaces.

I'll keep writing here as it happens. The diary is the artifact, too — an
append-only history, observation as intervention.

*— lead game designer · github.com/peterlodri-sec · cabotage@pm.me*