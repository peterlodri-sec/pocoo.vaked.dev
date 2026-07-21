---
title: "Vaked leaves the monorepo: a language gets its own house"
date: 2026-07-21
tags: [vaked, compilers, language-design, nix, capability-systems, open-source]
description: "Vaked — the flake-native capability-graph language — has been carved out of the vaked-base monorepo into its own standalone repository, with full commit history and a README that doubles as documentation. Here's what moved, what stayed behind, what the type checker actually catches today, and why the split happened now."
draft: false
---

[vaked](https://github.com/peterlodri-sec/vaked) is public, standalone, and has its own commit history for the first time. Until today it lived inside `vaked-base` — a sprawling monorepo carrying agent daemons, a mesh runtime, ops tooling, and about a dozen other subsystems that happened to grow up around the language. That was fine while the language and its first consumer were co-evolving. It stopped being fine once "the language" and "the monorepo built on the language" needed to be two different things with two different audiences.

So it's been extracted — `git filter-repo`, not a fresh copy, so the 266 commits of history that shaped the grammar are still walkable with `git log`, `git blame`, and `git bisect` on the new repo.

## What actually moved

The rule for inclusion was: is this part of the language toolchain, or is it something built *on* the language toolchain?

**In:** the grammar (`vaked/grammar/vaked-v0-plus.ebnf`, v0.3, 29 kinds), the reference compiler (`vakedc/` — Python, stdlib-only, parse → check → lower), the in-progress Zig port (`vakedz/`), the shared `lib/` package it builds on, the normative design docs (`docs/language/0001` through `0028`), the differential test corpus, and the `bin/vaked` CLI.

**Out:** the agent fleet (`vaked-agents/`), the mesh runtime daemons (`agent_guardd`, `genesisd`, `eventd`, and a dozen more), ops/infra glue, and — this one was subtler — a *second, unrelated grammar* called `hcplang` that had been living in the same `tests/spec/` directory and getting exercised by the same test files as Vaked's own grammar tests, purely because someone put both test files in one folder eighteen months ago. Splitting the repo forced untangling that: `test_grammar_selfcontained.py` and `test_examples_parse.py` got trimmed down to only assert things about Vaked, and `hcplang`'s lexer got left behind where it belongs, with the protocol code it actually describes.

One thing that *didn't* fully survive the cut cleanly: a handful of the `0012`–`0024` design docs cross-link to `protocol/`, `superpowers/`, and `runtime/` docs that live in the parent monorepo. Those links are now dangling, and `tests/spec/test_doc_links.py` says so loudly rather than silently passing. That's the honest state — rewriting two dozen RFCs' worth of cross-references wasn't a same-day job, so it's flagged as a known limitation instead of quietly swept under a passing test suite.

## What you get on day one

Everything that was already load-bearing kept working, because the extraction didn't touch the code — only its zip code.

```sh
$ vaked check vaked/examples/primitives/mesh.vaked
vakedc: mesh.vaked — no diagnostics
✓ check 177ms
```

And the type checker's centerpiece — capability attenuation — still catches what it always caught. Take the companion fixture pair `conformant.vaked` / `rejected.vaked`: same shapes, `rejected.vaked` deliberately broken three independent ways —

```vaked
mesh reviewField {
  node author    { role = "author";   capabilities = [fs.repo_ro] }
  node reviewer  { role = "reviewer"; capabilities = [fs.repo_rw] }
  author -> reviewer : "handoff"    # reviewer ends up with MORE authority than author
}

stream telemetry {
  source = agentGuardd.ringbuf
  type   = Event.Ebpf
  fps    = 0        # violates the schema constraint `fps > 0`
  colour = "grey"   # `stream` is a CLOSED schema; `colour` isn't a declared field
}
```

```sh
$ vaked check vaked/examples/types/rejected.vaked
rejected.vaked:32:3: error: E-CAP-ATTENUATION: delegation `author -> reviewer` escalates authority: receiver holds `fs.repo_rw` but sender holds fs.repo_ro (receiver's grant must be ≤ the sender's in domain `fs`) [mesh reviewField]
rejected.vaked:41:9: error: E-CONSTRAINT-RANGE: field `fps`: value 0 violates `> 0` [stream telemetry]
rejected.vaked:45:3: error: E-CONFORM-UNKNOWN-FIELD: `colour` is not a declared field of closed schema `stream` [stream telemetry]
✗ check 117ms (exit 1)
```

Three diagnostic classes, three error codes, precise `line:col`, in one run, with no test suite or runtime assertion involved — the type checker rejects this before a single artifact is generated. That's `E-CAP-ATTENUATION` doing exactly the thing the mantra promises: *Vaked declares.* If a mesh edge would hand a node more authority than its sender actually holds, the graph doesn't type-check, full stop.

## Honest about what's not done

`parse` and `check` are real and exercised against the full example corpus. `lower` is normatively specified — `docs/language/0012-lowering.md` walks through, field by field, exactly what artifacts the flagship `operator-field.vaked` example should produce (a Zig engine config, a catalog JSONL with a `_generated` header, a `flake.nix` pinned to a 40-hex `nixpkgs` rev) — but emitter coverage for arbitrary programs is still landing. Run `vaked lower` on most example files today and you'll get a `provenance.json` with an empty `artifacts` map, not a filesystem full of generated configs. The README says this plainly rather than letting the CLI's confident exit code imply otherwise.

That's the shape of a language mid-flight: grammar and type checker solid enough to trust, lowering specified in enough detail that the fixtures are hand-verifiable against the docs, and a Zig port building and testing clean but not at parity yet. Extracting it now — rather than waiting for lowering to be "done" — is a bet that a language is easier to grow in public once strangers can `git clone` it without also cloning an agent fleet they didn't ask for.

Repo: [github.com/peterlodri-sec/vaked](https://github.com/peterlodri-sec/vaked). The README is written to be read as documentation, not skimmed as a landing page — grammar, type system, pipeline, full CLI reference, and every code block in it is real compiler output.
