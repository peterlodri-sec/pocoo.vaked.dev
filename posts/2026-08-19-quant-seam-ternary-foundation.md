---
title: "The Quant Seam: Bringing BitNet b1.58 Ternary Quantization Into the Harness Core"
date: "2026-08-19"
author: "Peter Lodri"
tags: ["quantization", "ternary", "harness", "llm", "architecture", "benchmark"]
---

# The Quant Seam: BitNet b1.58 Ternary Quantization As a Core Capability

Most quantization work lives in kernels — Metal, NEON, CUDA — and stops there. The harness that *drives* the model never sees the math; it just calls an API and hopes. In the deepsiper-enthea cycle we just shipped, we inverted that: we made low-bit ternary quantization a **capability seam in the harness core**, with the engine's own quantizer semantics as the single source of truth.

## The stack was already three layers deep

- **The harness** (TypeScript, Cordis plugins) — where the model-facing contract lives.
- **The entheai engine** (Rust) — `crates/ternary` holds the real group-based symmetric ternary quantizer: `scale_g = max(mean(|w| over group), 1e-7)`, code `round(clamp(w / scale_g, -1, +1))`.
- **MLX-QUANT / hw-ultra** (bare-metal) — Metal, NEON SIMD, `agx_doorbell` dispatch that bypasses the OS entirely.

But there was no wire between them. No `ctx.quant`, no provider registry a hardware backend could slot into, no correctness gate. The benchmark graded a model-facing `BitLinear {-1, 0, +1}` task, yet nothing verified the *semantics*.

## The seam, mirroring the LSP pattern

We built it exactly like the LSP seam (Service Definition / Provider / Consumer):

- **`@deepseek-ai/dsh-quant`** (`ctx.quant`) — provider registry keyed by branded backend id, order-independent selection, three operations: `quantize`, `gemm`, `capabilities`. A closed result union, so adding a backend never changes the model contract.
- **`@deepseek-ai/dsh-quant-reference`** — the pure-software provider, reproducing the entheai formula *bit-for-bit*. It is the **parity target**: every future hardware provider must produce identical quantize output for the same input.
- **`@deepseek-ai/dsh-tool-quant`** — the model-facing `quant_ternary` tool, deliberately **opt-in**. It ships summary-only output (bits-per-weight, memory ratio vs FP16) so the model never eats a codes matrix.

The seam + reference provider are mounted in the core `dsh-base` bundle with **zero model-visible surface**. The tool stays opt-in until a hardware backend passes the evidence gate: 8× memory vs FP16, PPL ≤ +0.05, >350 GB/s sustained.

## Verification that means something

- The worked example pins the semantics: `[3.0, -1.0, 0.2, -0.4]`, group 4 → scale 1.15, codes `[1, -1, 0, 0]`.
- Round-trip dequantize error ≤ 1e-3; ternary GEMM vs dense ≤ 1e-3.
- **26/26 tests** across the three packages; the headless core boots with the seam mounted.

And the benchmark harness became a first-class gate: `pnpm bench:entheai` runs the full 5-task AST + logic sweep against a deterministic stub backend — **100% pass across all five**, every time, keylessly. `pnpm bench:entheai:verify` gates the grading logic itself without touching the runtime.

## The observer that never touches the cache

While we were in the foundation layer, we designed what comes next: a **cache-phase observer**. The idea that survived the brainstorm:

- A warm-up window (~10 turns) establishes a **baseline** prefix-reuse ratio (~95%).
- An always-on guard **arms** a heavier observer the moment the ratio drops past a baseline-relative band (`median − k·σ`, not a hard number).
- The armed observer reads only **settled history** — never the current, next, or last turn. It cannot cause a regression because it has no write path.
- It **decomposes the cause**: a hit-rate drop with stable latency = workload phase shift; stable hit-rate with latency-variance spike = environment/network. The notification says *what kind* of serious change it was, enqueued, never blocking the loop.

No eviction policy switching, no live-state mutation. Just an advisory signal that tells the user their warm cache just went cold — and why.

## The pattern

Capability seams, parity-tested software references, evidence-gated hardware defaults, and observers that watch from off the hot path. That's the foundation layer of a sovereign harness: the quantization math is a first-class citizen, the benchmark never lies, and the cache tells you the truth from a safe distance.

*deeipsiper-enthea · foundations · fine touch from within · vaked.dev*
