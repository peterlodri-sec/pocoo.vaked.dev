---
title: "Parallel by default: a 3.7x shell speedup with Nushell par-each"
date: 2026-06-11
tags: [nushell, nix, parallelism, tooling, performance]
description: "We swapped a bash/Amber task runner for Nushell and got a measured 3.7x on fan-out work. Here's the benchmark, why par-each wins, and why Nix - not the shell - is what actually keeps it reproducible."
draft: false
---

Most of our slow dev-loop pain isn't one slow command. It's the *fan-out*: check every file, render every host config, deploy to every box - done one at a time in a `for` loop. The fix isn't a faster command; it's running them at once. We moved our task runner off a bash/Amber baseline to **Nushell**, and the fan-out collapsed.

## The benchmark

Workload: 24 independent `vakedc check` runs (our compiler's parse+typecheck on 24 files), each in its own working dir so there's no shared state. 8-core machine, Nushell 0.113.1.

| run | wall-clock |
|---|---|
| bash sequential loop | 2.25 s |
| `nu` `each` (sequential) | 2.56 s |
| **`nu` `par-each` (parallel)** | **0.69 s** |

**par-each is 3.7x faster than sequential `nu each`, and 3.3x faster than the bash loop.**

Two honest notes so the number means what it looks like:

- That 0.69 s is **24 full process launches** (separate Python + compiler invocations) fanned across 8 cores - not one magic call. One check is ~60 ms; 24 sequential is ~2.3 s; 24 parallel is roughly `ceil(24/8) x 60ms` + shell overhead.
- The `each`-vs-bash gap (2.56 vs 2.25 s) is real: Nushell's per-spawn cost is slightly heavier than bash's. The entire win is the **parallelism**, and it scales with cores. On a single file there is nothing to parallelize - it's ~60 ms either way. The floor is the per-task process startup, not the shell.

So the rule is simple: any "do X across the whole fleet/repo" operation drops to roughly `cores`-fold faster.

## Why Nushell, specifically

`par-each` isn't just "run in background with `&`". It's a structured map over a list that returns a list:

- `par-each --keep-order` (`-k`) forces output order to match input order, so a parallel fan-out is still **deterministic and ordered** - the result is identical to the sequential version, just faster. `-t/--threads` bounds concurrency.
- External commands compose cleanly: `do { ^cmd } | complete` returns a single `{ stdout, stderr, exit_code }` record. No `set -o pipefail` dance, no `$?` juggling. (Since 0.98 a non-zero external exit is an error by default; pipefail is default-on from 0.111.)
- Typed custom commands catch argument- and return-type errors at *parse* time - CI-grade validation before anything runs.

That last part matters for cleanness as much as speed: the previous runner (compiled from Amber to bash) needed workarounds for alpha-stage parser quirks. The Nushell version has none - exit codes come from a structured record, not string-scraping.

## The production form

The runner that backs the benchmark, `vaked-run.nu`, has three modes - all verified on 0.113.1:

```nu
# parallel-check N files, deterministic ordered output, CI exit code
def "main files" [...files: string, --no-color] {
  let results = ($files | par-each --keep-order { |f|
    let res = (do { ^python3 -m vakedc check $f } | complete)
    { file: $f, ok: ($res.exit_code == 0) }
  })
  $results | each { |r| print $"(if $r.ok {'✓'} else {'✗'}) ($r.file)" } | ignore
  let bad = ($results | where not ok | length)
  if $bad > 0 { exit 1 }
}
```

`all` runs parse → check → lower with BuildKit-style step output (`=> [1/3]`, ✓, per-step timings, `[+] DONE`); `--no-color` / `NO_COLOR` are honoured; everything returns a real exit code for CI.

## The honest part: the shell is not your reproducibility

A shell's purity ends the moment it shells out. `par-each` is deterministic in *ordering*, but `^git`, `^nix`, `^systemctl` are governed by the filesystem, the clock, and the network - not by Nushell. The reproducibility guarantee comes from **Nix**: pinning every input and sandboxing the build, *around* the commands the shell runs.

Which is also why we **pin the exact Nushell version** (0.113.1) in the flake. Nushell is pre-1.0 and ships breaking changes on a ~4-6 week minor cadence (`let`-in-pipeline arrived in 0.110, pipefail flipped to default-on in 0.111). An unpinned shell is an unpinned dependency; the flake lock makes a future release unable to silently change our automation.

## Takeaways

- The speedup lives in **fan-out**, and it's linear in cores. Reach for `par-each --keep-order` whenever you're looping over files/hosts/configs.
- Nushell buys **cleanness** too: structured `complete` exit codes and parse-time type checks beat the bash/Amber error-handling tax.
- **Pin the shell, sandbox with Nix.** The shell gives you parallelism and ergonomics; Nix gives you reproducibility. Don't conflate the two.
