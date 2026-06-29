---
title: "kompress-ultra vs AGENTS.md — the inline-code gap"
date: 2026-06-29
tags: [kompress-ultra, ultrameshai, caveman, compression, agi-mem, regression-fixture, proposal]
description: "Running kompress-ultra Ultra against a real 290-line AGENTS.md exposed a fidelity gap: it flattens headings, tables, blockquotes, and mangles inline-code spans. A regression fixture, a bun CLI, and a follow-up to add a markdown-aware pre-pass."
---

Same session, second post. The crabcc archival went into [the previous post](2026-06-29-archiving-crabcc.md). This one is about a small, concrete experiment I ran on `kompress-ultra` — the same engine the dogfeed package uses to compress loop output before pushing to HuggingFace.

Spoiler: the experiment found a real fidelity bug, in a regression fixture, in the form of a CSV comparison table.

---

## the setup

`kompress-ultra` is a Bun-based compression library that I use (via `dogfeed` and via direct calls in ultrameshai loop code) to prune tool output and chat history for token budget. Its design target is **chat-history pruning** — where the priority is bytes/line, not structural fidelity. The rewriter is a character-stream regex pass that protects fenced code blocks (`__CODE_BLOCK_n__` placeholders), flattens everything else, then un-protects.

I wanted to know what happens when you point it at a **document-style memory file** instead. So I took a real 290-line `AGENTS.md` (the root one in this repo, after the crabcc cleanup), ran it through the Ultra level, and compared the output against a hand-applied `caveman-compress` pass (the same rules the `caveman` skill applies to memory files).

The full fixture is in [`peterlodri-sec/kompress-ultra#1`](https://github.com/peterlodri-sec/kompress-ultra/pull/1).

## the table

| Artifact | Bytes | Lines | Δ |
|---|---|---|---|
| original | 15,502 | 290 | — |
| 01-caveman | 14,450 | 203 | −6.8% |
| 02-kompress-ultra | 13,998 | 99 | −9.7% |

`caveman-compress`: preserves markdown structure, shortens prose, ships readable as a memory file.

`kompress-ultra` Ultra: bigger savings, but mangles inline-code spacing (`AGENTS. md`, `. gitignore`, `. claude/settings. json`) and flattens headings / blockquotes / tables into single lines — its `__CODE_BLOCK_n__` protection covers **fenced blocks only, not inline spans**.

## the gap

The headline numbers look good. The byte delta is a real win, and the line delta is bigger. But the *output* is not a document anymore:

- Headings become one-line runs of text.
- Tables collapse to single lines — cells still separated by pipes, but the row breaks are gone.
- Blockquotes flatten.
- Inline code spans (backticks) get word-split — `AGENTS.md` becomes `AGENTS. md` because the regex treats `.` as a sentence boundary and the rewriter doesn't know the backticks are there.

For chat-history pruning, none of this matters. The downstream LLM reads the compressed form, the line breaks are re-injected at render time, and the backticks-vs-spaces distinction is lost in tokenization anyway. For document-style memory files — `AGENTS.md`, `CLAUDE.md`, `README.md` — it matters a lot. You can't round-trip a memory file through Ultra and expect to commit the result.

## the fix (follow-up, not in this PR)

The right move is a **markdown-aware pre-pass** that:

1. Strips inline backticks to `__INLINE_CODE_n__` placeholders (mirroring the fenced-block pattern).
2. Maybe preserves heading levels as `__H2__` / `__H3__` markers instead of flattening.
3. Keeps table row breaks.
4. Keeps blockquote prefixes.

Then the character-stream regex runs on the placeholder-stripped text, and the un-protection pass restores the inline spans *and* the structural markers.

That's a real piece of work — it's essentially a small markdown parser/emitter pair. I haven't written it yet. The PR is the **failing-fidelity target**: any future change to `rewriter.ts` or any new pre-pass should keep the `02-kompress-ultra.md` output's byte/line savings **and** make it round-trippable.

## why this is a real result, not just a complaint

The reason this matters beyond the one bug is that it tells us **what the tool is and isn't**. Until you have a failing test that exercises the wrong-direction case, you can't tell whether the tool is correctly scoped or just unfinished. Now we know: it's correctly scoped for chat-pruning, and it has a clear extension path to memory-file compression via a pre-pass.

That's the kind of artifact that makes the rest of the fleet better. The dogfeed loop can keep using Ultra on tool output, the agent session harness can keep using it on chat history, and a future `caveman-ultra` hybrid can target the memory-file case — all without re-litigating the design.

## the build

The fixture is reproducible. `scripts/run-ultra.mjs` is a 7-line bun CLI:

```js
import { readFile, writeFile } from "node:fs/promises";
import { compressMessage, CompressionLevel } from "../../src/compress.ts";

const [inFile, outFile] = process.argv.slice(2);
const input = await readFile(inFile, "utf8");
const output = compressMessage(input, CompressionLevel.Ultra);
await writeFile(outFile, output);
```

Run it: `bun run scripts/run-ultra.mjs 00-original.md 02-kompress-ultra.md`. Same input, same output, byte-identical. Add a CI step that runs this on a markdown fixture and diffs against the checked-in expected output, and you've got a regression net for the markdown-aware pre-pass.

## tl;dr

- I ran `kompress-ultra` Ultra against a 290-line `AGENTS.md` to find its limits.
- It mangles inline-code spans, flattens headings/tables/blockquotes. Not a bug for chat-pruning (its target). A bug for memory-file compression.
- The fix is a markdown-aware pre-pass that mirrors the fenced-block placeholder pattern. That's a follow-up.
- The PR is the **failing-fidelity target** for that follow-up.
- Recommendation + all crabcc cleanup are in the same PR ([#1](https://github.com/peterlodri-sec/kompress-ultra/pull/1)).

Same loop, different substrate. The data we generate gets better. The tools we use to generate it get tested. The next idea gets a foundation that the last one didn't have.

*— peter*
