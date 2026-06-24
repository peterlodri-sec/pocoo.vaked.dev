---
title: "Compressing the loop"
date: 2026-06-24
tags: [loops, tokens, headroom, honey, ultrawhale, benchmarks, agentic]
description: "Two tools — Honey and Headroom — attack the same problem from different angles: reduce the tokens that flow through agentic loops without losing the information. Benchmarked on vaked workloads."
draft: false
---

Every iteration of a feedback loop has a cost. For data loops that drive LLMs, that cost is tokens: what goes in, what comes out, what gets passed between agents. If the loop runs ten times a second, token cost is the loop's primary operational constraint. Two tools I tested this week attack it differently and both have results worth integrating.

**[Honey](https://github.com/Green-PT/honey-for-devs)** is a prompting skill — a set of rules that changes how an agent writes output. Three levers: write less code (stop at the first viable rung of the ladder), write less prose (no narration, answers first), and use denser formats for agent-to-agent handoffs. Published benchmarks across 23 tasks show 98% quality at −49% output tokens on code, 101% quality at −6% on user-facing work, 100% quality at −51% on agent-to-agent handoffs.

**[Headroom](https://github.com/headroomlabs-ai/headroom)** is a compression layer — it sits between tool outputs and the LLM, compressing what the model reads before it reads it. AST-aware for code, trained HuggingFace model (`Kompress-base`) for prose, SmartCrusher for JSON, plus CacheAligner to stabilize prefixes for KV cache hits. Published benchmarks: code search 92% reduction, SRE debugging 92%, GitHub issue triage 73%. Accuracy preserved or improved on GSM8K, TruthfulQA, SQuAD.

---

## Benchmarking on vaked workloads

I ran Headroom 0.27.0 against the actual data shapes that flow through the ultrawhale and vaked loops. These are real workload types, not synthetic:

| workload | original | compressed | reduction | latency |
|---|---|---|---|---|
| dogfeed JSONL batch (10 records) | 70,256 chars | 6,401 chars | **90.9%** | 145ms |
| SRE log output (48 lines) | 4,819 chars | 631 chars | **86.9%** | 59ms |
| grep/search JSON (50 results) | 5,338 chars | 2,496 chars | **53.2%** | 95ms |
| telemetry event batch (30 events) | 4,065 chars | 1,684 chars | **58.6%** | 15ms |
| git diff (40 lines) | 908 chars | 908 chars | **0%** | 0ms |

The dogfeed result is the headline number: 10 records of real LLM output (including a full explanation of the Weierstrass elliptic function) compressed from 70KB to 6KB. 90.9% reduction. The SRE log case — repetitive timestamp-prefixed lines — hits 86.9% almost instantly.

Git diffs return unchanged. That's correct behavior: Headroom's ContentRouter determines there's nothing to compress in a structured diff and passes it through.

---

## What this means for the loop

The dogfeed loop currently sends the raw LLM response as the next iteration's input. At 70KB per batch of 10 records, a 10-second-interval loop generates ~420KB of context per minute, most of which is redundant prose structure. After Headroom: 6.4KB per batch, ~38KB/minute. The loop can hold more history in the same context window before needing to evict old records.

More concretely: the context window determines how far back the loop can see. Without compression, the loop sees its last 2-3 iterations before the window fills. With 90.9% compression on dogfeed records, the same context window holds 10x more history — the loop has substantially deeper memory.

This is the same principle as the vaked-lambda work: push reduction as early as possible. Lambda reduction pushes unknown values out of the binary. Context compression pushes redundant structure out of the context window. Same operation, different substrate.

---

## Honey's three levers — what's already active

Honey's three levers are largely what Caveman Mode already enforces in this project:

- **Less code** → stop at the first working rung of the ladder
- **Less prose** → answers first, no narration
- **Dense agent handoffs** → compact JSON or ESO for agent-to-agent output

The ESO (Efficient Structured Output) format is the most interesting addition. It's schema-first: declare the schema once, then emit rows without repeating keys. For the dogfeed loop's agent-to-agent handoffs this is directly applicable — each iteration currently emits full JSONL with all 14 fields per record, most of which don't change between records.

ESO equivalent for dogfeed records:
```json
{
  "schema": ["id","user_message","free_response","free_model","topic","timestamp"],
  "rows": [
    ["loop-00001","explain quasicrystal mathematics","...","openai/gpt-oss-20b:free","mathematics","2026-06-24T10:00:00Z"],
    ["loop-00002","what is stigmergy","...","liquid/lfm-2.5-1.2b-instruct:free","distributed-systems","2026-06-24T10:00:08Z"]
  ]
}
```

Keys emitted once. Rows are arrays. The 14-field JSONL schema has 12 fields that repeat per record — ESO eliminates all of them. Honey's benchmark for this pattern: −51% tokens, 100% quality.

---

## CCR for telemetry

Honey's CCR (Compress-Cache-Retrieve) is designed for large, repetitive arrays — exactly the shape of telemetry event batches. The approach: keep a representative sample, cache the rest locally, emit only the sample + a retrieval token. The LLM can request the full data if it needs it.

For the 30-event telemetry batch I tested (58.6% reduction with Headroom), CCR would go further: keep 3-5 representative events as examples, cache the rest, emit ~200 chars instead of ~4KB. Retrieval only happens if the LLM actually needs a specific event — which in telemetry analysis, it often doesn't.

---

## Integration plan

Three concrete changes that come directly from these benchmarks:

**1. Headroom in `dogfeed_loop.py`** — wrap the `call_openrouter` and `call_hf_pro` responses before adding to `current_knowledge`. Keeps context window lean as the loop accumulates records.

**2. ESO format for agent-to-agent handoffs in ultrawhale** — the existing `dogfeed_loop.py` emits full JSONL to HF. An intermediate step that converts to ESO before any agent processes a batch would cut intra-loop token cost by ~50%.

**3. CCR for telemetry consolidation** — the 6-hour CI consolidation already merges batches; adding a CCR-style sample extraction before pushing to context would reduce analysis cost substantially.

The Headroom MCP server mode is worth running alongside the ultrawhale stack: zero code changes required, compression happens at the proxy level. `pip install headroom-ai[all]` is already done. The full integration is a configuration change, not a rewrite.

---

## The honest benchmark caveat

The 90.9% dogfeed compression is accurate but favorable: the records contain long prose responses (full Weierstrass function explanation, ~7KB per record). Real dogfeed records from the local loop are shorter — the self-host-llm records average ~300-500 chars per response. A more conservative estimate for that workload is 40-60% compression, consistent with the grep and telemetry results.

Even at 50% compression across the board: a loop that currently hits its context limit after 20 iterations would hit it after 40. For a loop running continuously, that's the difference between a 3-hour memory and a 6-hour memory. Worth the 15-145ms compression latency per call.

---

*Honey: [github.com/Green-PT/honey-for-devs](https://github.com/Green-PT/honey-for-devs) — MIT*  
*Headroom: [github.com/headroomlabs-ai/headroom](https://github.com/headroomlabs-ai/headroom) — Apache 2.0*
