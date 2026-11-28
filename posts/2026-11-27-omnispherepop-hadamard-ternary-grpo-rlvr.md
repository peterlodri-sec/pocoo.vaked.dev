---
title: "OmniLLL Part 2: 1.58-Bit Ternary RLVR Diffs Beat Dense FP16 GRPO (Walsh-Hadamard PTQ & Omnispherepop v1.1.0)"
date: 2026-11-27
description: "Empirical Colab T4 findings on Qwen2.5-1.5B-Instruct: why compressing a Dr. GRPO reasoning diff to 1.58-bit Omnispherepop trits doubles base accuracy and beats FP16 GRPO (25.0% vs 20.8%), how 1D/2D Walsh-Hadamard cuts KL by 13x, and what landed in ospop v1.1.0."
tags: [rust, omnilll, omnispherepop, ternary, grpo, rlvr, hadamard, quantization, qwen, research]
draft: false
section: research
series: omnilll
series_index: 2
---

# OmniLLL Part 2: 1.58-bit ternary RLVR diffs beat dense FP16 GRPO

*omnilll · omnispherepop v1.1.0 · walsh-hadamard · 1.58-bit rlvr diffs · zero-unsafe rust · vaked.dev*

---

> **Series Navigation:** [Part 1: Discussion #86 Post-Mortem & The Zero-Python Pure-Rust Awakening](/posts/2026-11-19-omnilll-discussion-86-zero-python-pure-rust.html) · **Code (`v1.1.0`):** [`8b-is/omnispherepop`](https://github.com/8b-is/omnispherepop) · **Benchmarks:** [`docs/BENCHMARKS.md`](https://github.com/8b-is/omnispherepop/blob/main/docs/BENCHMARKS.md)

---

## The surprise result

In [Part 1](/posts/2026-11-19-omnilll-discussion-86-zero-python-pure-rust.html), we mapped the memory-bandwidth roofline behind sub-4-bit quantization. The obvious next question for [**Omnispherepop**](https://github.com/8b-is/omnispherepop) — our `#![forbid(unsafe_code)]` Rust weight-programming toolkit (`ospop`) — was empirical: **what actually happens when you push a real 1.5B reasoning LLM (`Qwen/Qwen2.5-1.5B-Instruct`) through 1.58-bit ternary quantization, Walsh-Hadamard rotation, and verifiable reinforcement learning (Dr. GRPO)?**

On a free Google Colab Tesla T4 (15.64 GB VRAM, `0.00 CU`), we ran two complete experimental sweeps across 48 deterministic held-out Countdown arithmetic reasoning tasks (`seed=1337`: 24 × 3-number, 24 × 4-number, verified via exact `Fraction` AST evaluation) and cross-checked exported checkpoints directly against the Rust `ospop` binary (**`0.00e+00`** sparsity and MSE parity to 15 decimal places).

The headline finding caught us off guard:

**Quantizing *only* the RLVR weight update $\Delta W = W_{\text{GRPO}} - W_{\text{base}}$ into 1.58-bit `ospop` trits (`{-1, 0, +1}` with per-group scales, 5-trit packed = 88.4% smaller than FP16 / 95.0% smaller than FP32) didn't just preserve the Dr. GRPO reasoning gain — it *outperformed* the unquantized FP16 GRPO model it was compressed from (`25.0%` vs `20.8%`), doubling FP16 Base (`12.5%`) with `100.0%` format compliance.**

| Configuration (48 held-out Countdown tasks, greedy) | ALL Acc | 3-Num | 4-Num (0-shot transfer) | XML Format | Mean Tokens |
|---|---:|---:|---:|---:|---:|
| `FP16 Base` (`Qwen2.5-1.5B-Instruct`) | 12.5% | 25.0% | 0.0% | 52.1% | 108 |
| `FP16 Pure-Binary Dr. GRPO` (80 steps, trained on 3-num only) | 20.8% | 29.2% | 12.5% | 97.9% | 117 |
| **`FP16 Base + ospop 1.58b Plain GRPO Diff`** *(−88.4% vs FP16)* | **25.0%** | **37.5%** | **12.5%** | **100.0%** | 106 |
| **`FP16 Base + ospop+had2 1.58b GRPO Diff`** | **22.9%** | **33.3%** | **12.5%** | **100.0%** | 102 |
| `Post-Hoc ospop+had2 of FP16 GRPO` (`4/28` layers ternary) | 16.7% | 25.0% | 8.3% | 93.8% | 122 |
| `Cold-Start STE Ternary-Aware Dr. GRPO` (`4/28 had1`, 35 steps) | 0.0% *(train 10.0%)* | 0.0% | 0.0% | 0.0% | 59 |

---

## 1. Why a 1.58-bit ternary RLVR diff beats dense FP16

Running our new `ospop trit-diff` subcommand on exported Layer-14 `o_proj` weights (`65,536` F32 values, `512` groups of `128`) reveals the mechanism immediately:

```text
$ ospop --file ospop_grpo_layer14.safetensors trit-diff \
    --base layer14.o_proj.base --target layer14.o_proj.grpo --group-size 128

trit-diff layer14.o_proj.base -> layer14.o_proj.grpo (group 128): 144 / 65536 changed (0.220% flip, 0 direct sign flips)
1.58b delta: 13108 B (5-trit) vs 262144 B (f32)  delta_sparsity 41.9%  delta_mse 8.439e-10  energy_retained 81.8%
```

Look at those two numbers side by side:
1. **`delta_sparsity = 41.9%`**, **`energy_retained = 81.8%`**, **`delta_mse = 8.439 × 10⁻¹⁰`**.
2. Policy-gradient updates under high-variance binary RLVR contain substantial low-magnitude gradient noise across all 1.31B linear weights. `ospop`'s strict per-group threshold $\Delta = 0.7 \cdot \text{mean}(|w|)$ zeros out the bottom ~42% of tiny noisy perturbations (discarding 18.2% noise energy) while preserving 81.8% of the directional signal at **1.6 bits per weight** (`2,620.4 MB → 303.0 MB` across all 196 matrices).

In other words, **ternary weight diffing acts as a natural structural denoiser for RLVR.**

---

## 2. Mechanistic trit-flip anatomy: where RLVR actually writes

Comparing all 196 linear projections across all 28 layers before and after Dr. GRPO exposed a stark structural overlap between **quantization fragility** and **RLVR plasticity**:

- **Global trit-flip rate:** Only **`0.115%`** of trits changed state across 1.31B linear weights — with **`0.00000%` direct `+1 ↔ -1` sign flips**. Every single RLVR trit transition crossed the zero dead-zone (`0 ↔ ±1`).
- **Attention dominates RLVR updates by 2.7× over `down_proj`:**
  `k_proj` (`0.162%`) > `q_proj` (`0.160%`) ≈ `o_proj` (`0.160%`) > `v_proj` (`0.136%`) > `up_proj` (`0.133%`) ≈ `gate_proj` (`0.133%`) ≫ `down_proj` (`0.060%`).
- **Mid-network reasoning hub overlap:** Profiling per-layer logit KL under ternary PTQ showed a **43.5× sensitivity gap** (`L13: KL=4.09` vs `L7: KL=0.094`). The top KL-sensitive layers (**`L12, L13, L14`**) are the *exact same layers* with the highest Dr. GRPO trit-flip rates (`0.121%, 0.121%, 0.126%`).

---

## 3. Walsh-Hadamard pre-rotation (`--hadamard` & `--hadamard-2d`): 13× lower KL

Zero-shot `ospop` PTQ on raw `Qwen2.5-1.5B` weights hits an outlier cliff (even 4/28 least-sensitive layers drop to `0.0%` format). Applying an orthonormal block-wise Walsh-Hadamard transform ($H_{128} = H_{128}^T = H_{128}^{-1}$) before quantizing disperses heavy-tailed channel outliers uniformly across every 128-weight group while preserving L2 norm and inner products exactly:

$$(x H)(W H)^T = x H H^T W^T = x W^T$$

| Mode | Mean Layer KL | Sparsity | Mean RMSE | `k=4/28` KL | `k=8/28` KL | `k=12/28` KL | `k=28/28` KL | `qdelta` A6P-L4 KL |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `plain` | 1.275 | 43.3% | 0.01290 | 0.82 | 2.59 | 6.68 | 11.76 | 10.29 |
| **`had1` (`W H`, `--hadamard`)** | 1.092 | 42.2% | **0.01238** | 0.18 | **0.20** *(13× lower)* | **1.24** *(5.4× lower)* | 10.39 | 10.49 |
| **`had2` (`H W H`, `--hadamard-2d`)** | **0.917** | 42.2% | 0.01239 | **0.16** | 1.81 | 1.54 | **6.98** *(−40.6%)* | **9.90** |

On real Layer-14 `o_proj` weights, `ospop quantize --hadamard-2d 256` compressed the per-group scale spread by **2.6×** (`[0.0079, 0.0335] → [0.0178, 0.0290]`), and at `k=8/28` (28.6% ternary) zero-shot `had1` jumped from `0.0% → 83.3%` XML format compliance.

Meanwhile, **45 steps (32.3 seconds on T4)** of `r=16` LoRA recovery on frozen 100% 1.6-bpw `ospop` weights dropped cross-entropy loss from `11.262 → 0.761` and resurrected format compliance from **`0.0% → 100.0%`**.

---

## 4. Cold-start STE vs post-hoc RLVR: an honest negative result

We also built a true Straight-Through Estimator (`STETernaryLoRALinear`) running live 1.6-bpw Hadamard-`ospop` weights during every rollout and backward pass (zero FP16 adapter bypass). Over 35 pure-binary Dr. GRPO steps, rolling sampled train accuracy rose `3.3% → 10.0%` and `ospop trit-diff --hadamard` confirmed active trit adaptation (`33 / 65,536 = 0.050%` flipped trits, `0` sign flips) — **yet greedy held-out eval dropped to `0.0%`**.

Without an FP16 warm-start, high-variance binary RLVR gradients over a fragile zero-shot ternary base destabilize greedy formatting. By contrast, **FP16 Pure-Binary Dr. GRPO → `ospop` 1.58-bit ternary diff (`25.0%`)** or **FP16 GRPO → post-hoc `had2` hybrid (`16.7%`, beating full FP16 Base's `12.5%`)** works cleanly out of the box.

---

## 5. What landed in Omnispherepop `v1.1.0`

Every empirical finding above is now shipped in pure, zero-unsafe Rust (`#![forbid(unsafe_code)]`, MSRV 1.78, 45/45 tests passing, 10 MCP tools):

- `ospop-core::hadamard::{fwht_blocks, fwht_2d}` — 1D (`--hadamard`) and 2D (`--hadamard-2d <ROWS>`) orthonormal Walsh-Hadamard pre-rotation with runtime orthogonal round-trip verification (`hadamard_orthogonal_ok: true`).
- `ospop-core::quantize::{trit_flip_stats, ternary_delta_patch}` + `ospop trit-diff` + `ospop_trit_diff` MCP tool — measures `flip_rate`, `sign_flips`, 5-trit compressed delta bytes, and `delta_energy_retained`.
- Full empirical benchmarks published in [`docs/BENCHMARKS.md`](https://github.com/8b-is/omnispherepop/blob/main/docs/BENCHMARKS.md).

```bash
# 2D Walsh-Hadamard ternary PTQ with orthogonal round-trip proof
ospop --file model.safetensors quantize --tensor layer14.o_proj.base --group-size 128 --hadamard-2d 256

# RLVR trit-flip anatomy + 1.58-bit delta compression & energy retention
ospop --file model.safetensors trit-diff --base layer14.o_proj.base --target layer14.o_proj.grpo --group-size 128
```

---

## 6. Next tracks

1. **Portable `.ospop.safetensors` 1.58-bit delta writer:** serialize 5-trit packed RLVR diffs + FP32 group scales so a 303 MB 1.58-bit reasoning patch can be loaded and stacked directly at inference time.
2. **SmoothQuant + Hadamard fusion:** test whether per-channel activation scaling before `W H` breaks the 28/28 zero-shot 1.6-bpw accuracy cliff on 1.5B–7B models.
3. **FP16-warm-started STE RLVR:** start STE from the `20.8%` FP16 Dr. GRPO checkpoint instead of cold-starting from zero-shot ternary.
4. **Sensitivity-gated hybrid + `L22` contrastive steering:** stack our `L12–L14` sensitivity guard + `had1` (`k=8/28`) with the monotonically separable `L22` reasoning steering direction (`proj_gap = 4.115`).
