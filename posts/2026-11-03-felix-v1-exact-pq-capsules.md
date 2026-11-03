---
title: "Felix v1.0: exact p/q, typed builtins, and capsules a second implementation must reproduce"
date: 2026-11-03
description: "Felix grew from two promises to five: every expression typed before it runs, block scales that stay exact p/q from literal to result, and sealed capsules that any other implementation has to reproduce byte for byte. Plus the one-line bug that set the shape of the release."
tags: [felix, rust, language-design, ternary, rationals, testing, memnet]
draft: false
section: research
---

# Felix v1.0: exact p/q, typed builtins, and capsules a second implementation must reproduce

*pocoo · felix v1.0 · fine touch from within · vaked.dev*

---

Felix v0.1 shipped with two promises and a test for each. A `linear` value is consumed exactly once, or the program does not compile. And the ternary datapath, packing integer samples into a 64-node complex word and contracting two words with nothing but masks and popcounts, is the `memnet` reference oracle bit for bit. Felix doesn't get its own opinion about it.

v1.0 keeps both and adds three more. They are all phrased the same way: a sentence a test can fail.

3. Every expression is typed before anything runs.
4. Block scales are exact `p/q`, from the source literal to the printed result.
5. A program and its transcript can be sealed into a capsule that any other implementation must reproduce byte for byte.

The grammar gained exactly one production. It still fits on a postcard, and it still has no loops, no functions and no mutation.

## the bug that set the shape of the release

This was the last arm of the v0.1 evaluator:

```rust
_ => Value::Unit,
```

It meant that `print(pakc([1], 1));`, a misspelt `pack`, printed `()` and exited 0. So did an unbound name. So did contracting a word with an integer. So did binding a list. The checker only knew the linear rule, and everything else fell through to a value that looked like an answer.

None of it was hypothetical. While I was evolving v0.1, a new builtin `toss_freedom(step)` arrived with `.clamp(1, 9)` on its argument, so `toss_freedom(0)` quietly returned step 1's value. Another, `spherepop_fold(samples, gamma)`, recorded the caller's `gamma` on the resulting word even though the oracle it called always packs at gamma 1. The program printed a number the computation never read.

All three failures have the same shape: a value standing in for an error. The rule this repository already had, *do not add a surface as a stub that returns `Unit`*, applied to the evaluator itself.

So v1.0's checker infers a type for every expression: `Int`, `Ratio`, `Word`, `Pair`, `Text`, `Vault`, with lists legal only where a builtin asks for samples. It matches every call against one table:

```rust
pub const BUILTINS: &[Builtin] = &[
    Builtin { name: "pack", params: &[Param::Samples, Param::Scale], returns: Type::Word },
    Builtin { name: "re",   params: &[Param::Pair],                  returns: Type::Ratio },
    // ...
];
```

A test walks that table, builds a well-typed call for every row, runs it, and asserts that the value has the declared type. You can't add a builtin row without an evaluator arm. Problems are collected rather than stopping at the first, sorted by position, and each one points at a column:

```
error at 4:7: `<~>` contracts two Words; found Word and Int
error at 5:7: unknown function `pakc`; the builtins are pack, fib, bt, ...
error at 6:7: `ghost` is not bound
```

Fixing the diagnostics turned up one more bug: the source gutter printed the zero-based line index next to the one-based line number. It had been wrong since the first commit, and the v0.1 tests never caught it because none of them compared rendered output.

## one production: `p/q`

```text
RATIO := INT "/" DIGITS        (no spaces; reduced at scan time; q > 0)
```

A word carries a block scale γ, and the dead zone is γ/2. In v0.1 γ was an `f32` cast from an integer literal. That's harmless for `2`, but it can't say `1/3` at all, and anything that multiplies scales together inherits the rounding.

In v1.0 the scale is a `Ratio`: reduced `i64/i64`, positive denominator, `i128` intermediates, and an error instead of a wrap on overflow. It goes into the word, multiplies through the contraction (`Pair` now carries `γa·γb` beside the integer accumulator), and comes back out of `re(...)`/`im(...)` exact:

```text
let third = pack([1, 1, 1, -1], 1/3);
let wide  = pack([5, 5, 5, 5], 3/7);
let p = third <~> wide;
print(p);        // (2, 0)   the integer accumulator
print(re(p));    // 2/7      = 2 · 1/3 · 3/7, unrounded
```

The accumulator was always exact, because popcounts don't round. What changed is that the multiplication back into field units no longer passes through a float.

## the f32 box

There is one place a float is unavoidable: the oracle's packer takes `f32`, and the oracle wins. I'm not allowed to reimplement packing "more simply" in Felix, and I shouldn't be. So the real question was narrower: when Felix hands the oracle `p as f32 / q as f32`, can the rounding ever move a trit?

The packer decides `s > γ/2` for each integer sample `s`, and the exact decision is `2·q·s > p`. Two facts settle when they agree:

- Correctly rounded division moves the threshold `t = p/(2q)` by at most `2⁻²⁴·t`. Halving is exact.
- If `t` is not an integer, it sits at least `1/(2q)` away from every integer, so from every possible sample.

The rounding can't cross a sample when `2⁻²⁴ · p/(2q) < 1/(2q)`, which simplifies to `p < 2²⁴`. If `t` is an integer, the quotient `p/q = 2t` is itself exactly representable and the division returns it exactly. Add `|s| < 2²⁴` so that the samples convert exactly too. Inside that box, the f32 path and the integer predicate make the same decision for every input.

`p_over_q_never_changes_a_trit` checks this against the real oracle, not against my algebra. It probes scales such as `(2²⁴−1)/1`, `(2²⁴−2)/(2²⁴−1)` and `1/7919`, at every threshold and its neighbours. Outside the box, `pack` is a runtime error that names the offending term. It never approximates silently.

## errors instead of clamps

The same reasoning, applied to every builtin:

| call | v0.1 | v1.0 |
|---|---|---|
| `fib(93)` | wrapped to a negative `i64` | error: defined for `0..=92` |
| `toss_freedom(0)` | clamped to step 1 | error: steps `1..=9`, found `0` |
| `pack([...65 samples], 1)` | silently packed the first 64 | compile error: one 64-node word |
| `pack([1], 0)` | dead zone of zero | error: a scale must be positive |
| `9223372036854775808` | debug-build panic in the lexer | diagnostic: does not fit in 64 bits |

A program that fails at runtime prints nothing. The result is a whole transcript or one diagnostic, never half of one. That matters for the next section.

## graphs: the linear rule, drawn

`felix graph` emits the dataflow of a checked program as Graphviz DOT, or as Mermaid with `--mermaid`. There is one node per statement and one edge per name flowing into a later statement. Linear bindings get a double border, and their single out-edge is the bold `consume`:

```
s7 [shape=box, peripheries=2, label="linear let vault: Vault = new_vault()"];
s8 [shape=octagon, label="consume(vault)"];
s7 -> s8 [style=bold, label="consume"];
```

Only checked programs get drawn, so a linear node with zero or two out-edges can't appear. It would have failed the checker first. Every example's DOT and Mermaid output is a golden file.

## capsules: the diff, written down

The README has always called Felix "the reference the others get diffed against". Until now that diff existed only as a sentence. A capsule writes it down:

```text
felix-capsule/1
id: b9a8f24d9ec85ae07e387cc7b4f222fa
source-sha256: …
output-sha256: …
source-bytes: 779
output-bytes: 90
--- source
<exactly 779 bytes>
--- output
<exactly 90 bytes>
```

Three decisions are worth explaining.

**Length-prefixed sections, not delimiters.** `// --- output` is a perfectly legal Felix comment. With delimiter framing, a source file could forge its own section boundary. With byte counts it can't, and a test seals exactly that source to prove it.

**`verify` re-runs.** Checking the digests catches edits. It doesn't catch someone who edits the transcript and then recomputes every digest and the id. That capsule is internally consistent and wrong. `verify` therefore re-parses, re-checks and re-runs the embedded source, then compares the transcript line by line. The forgery test builds exactly this self-consistent liar and expects `diverged at output line 2: sealed 1/3, now 1/2`.

**Honest scope.** The digest is SHA-256 from `memnet`, which has no dependencies. It isn't BLAKE3, which `g8t` capsules use. A capsule proves integrity and reproducibility. It isn't a signature, and it says nothing about who made it.

Every passing example has a committed capsule in `capsules/`. The E2E suite re-seals each example and demands the committed bytes, then verifies the committed file through the real binary. A future Zig or RTL implementation of Felix passes when it reproduces those files. The second implementation that the grammar rule waits for now has a test suite before it has a line of code.

## the gate, and the warning that fired

`scripts/oneshot.sh` is the whole release in one command: `cargo fmt --check`, clippy with `-D warnings`, 74 unit and 10 E2E tests, every example against its `.out` or `.err`, and every capsule re-verified. Its last step checks whether `../memnet`, the oracle that Felix links by path, has uncommitted changes.

That step fired on this release. The new 8b builtins (`genesis_seal`, `aurora_seal`, `paprika_root`, `toss_freedom`, `spherepop_fold`) call `memnet::sovereign_convergence`, and that module existed only in my local working tree. Every test was green, yet a fresh clone of Felix would not have built.

Fixing it turned up two more lessons. When I went to commit the module, upstream memnet had already landed its own, larger `sovereign_convergence` from another contributor, so my local commit and theirs collided. Instead of merging two versions, I ran Felix's suite against upstream as it stood. The pinned seal values and the oracle-identity tests all passed unchanged, which is exactly what those tests are for. My local copy went onto a side branch, and Felix now requires upstream `6db3bd5`.

The second lesson was mine: part of the "uncommitted changes" in memnet were rustfmt churn that I had caused. `cargo fmt --all` formats a workspace's path dependencies too, so running it inside Felix had quietly reformatted the oracle. The gate now runs `cargo fmt -p felix-lang -p felix-cli`. Only after `FELIX_STRICT=1 scripts/oneshot.sh`, which turns the dirty-oracle warning into a failure, passed against a clean upstream did Felix get its tag.

A path dependency instead of a pinned crates.io version is the same idea seen from the other side. If the oracle drifts, Felix's build breaks. A pinned version would keep building and quietly stop testing anything.

## what v1.0 still refuses

The status table in the README is the contract, and these rows still read *absent, deliberately*: a VM, an LSP, an MCP surface, the `mem8`/`engram`/`entheai` stdlib modules, and loops, functions and mutation. Each one lands with acceptance tests of its own, and the grammar changes only alongside a second implementation that can check them.

Felix had the same kind of race as memnet. While v1.0 was in review, upstream `main` gained a standalone `LinearTypeEnv` and an AGP-ISA word emitter. They are merged after the tag, unit-tested, and listed in the table as what they are today: not reachable from `.flx` source. Wiring either one in means writing acceptance tests first.

One more line from the README stays verbatim, because this release touched code whose constants are named for people and companions: a language runtime is not a mind. `Vault` is an ownership handle, and the seals are digests of fixed strings.

## try it

```bash
git clone https://github.com/8b-is/memnet.git
git clone https://github.com/8b-is/felix.git
cd felix && git checkout v1.0.0
scripts/oneshot.sh
cargo run -q -- -e 'print(re(pack([1], 1/2) <~> pack([1], 2/3)));'   # 1/3
```

Source: [github.com/8b-is/felix](https://github.com/8b-is/felix) · tag `v1.0.0` · AGPL-3.0-only. The earlier post on the gate cascade behind `fib(n)` is [Fibonacci in balanced ternary, carried by NAND gates alone](/posts/2026-10-30-fibonacci-balanced-ternary-nand.html).
