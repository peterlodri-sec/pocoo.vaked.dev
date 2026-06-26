---
title: "the voting ensemble paradox — resolved"
date: 2026-06-26
tags: [kompress, ensemble, loop-engineering, open-science, iclr]
description: "You build an ensemble of compression models, each fine-tuned from different checkpoints. You expect the ensemble to be better. It's worse. That's the voting ensemble paradox — formalized, proven, and fixed."
draft: false
---

You build an ensemble of compression models, each fine-tuned from
different checkpoints. You expect the ensemble to be better than
any single model. It's worse.

That's the voting ensemble paradox.

---

## The paradox

We formalized it: under k-of-N drop voting, the ensemble eviction
indicator equals the k-th order statistic of the per-voter
indicators. The ensemble collapses to its weakest member on every
stratum.

In plain terms: if you have 3 models voting on whether to keep or drop
each token, and any 2 agree, the ensemble score is the *second-worst*
model's score. The best model's judgment gets diluted by the weaker ones.
Adding more models makes it *worse*, not better.

We proved this (Theorem 1 + Corollary 1 + Remark 1) and validated it
empirically: an ensemble of v3, v3.1, and v3.2 scored 0.931 heretic
exact — worse than v4 alone at 0.967. The ensemble wasn't just not
better. It was actively harmful.

---

## The fix

A 3.0× weighted cross-entropy penalty on critical-syntactic tokens —
signal names, file paths, exit codes, compiler flags, anything the
agent needs intact.

Three mechanisms work together:

- **Mechanism A (training):** The 3.0× loss weight forces the model to
  prioritize must-keep tokens during fine-tuning. We mapped the full
  Pareto frontier: 3× → 0.955 heretic (15% compression), 5× → 0.963
  (3.7%), 10× → 0.972 (2.8%). The tradeoff is fundamental.

- **Mechanism B (inference override):** A post-inference regex safety
  net catches what the subword tokenizer splits across tokens. Compiler
  flags, hex addresses, file paths — patterns the single-token classifier
  misses. Deployed in [headroom PR #1419](https://github.com/headroomlabs-ai/headroom/pull/1419).
  Pushes agent mk_in_ref from 0.652 to 1.000.

- **Mechanism C (self-labeling loop):** The model labels its own training
  data, a stronger teacher corrects the mistakes, the corrected labels
  train the next version. v3→v4 internalized the override behavior
  (delta collapsed from +0.027 to 0.000). v8 used Qwen2.5-7B as the
  teacher for C3 self-distillation.

---

## kompress-v8

The production model: 149M-param dual-head ModernBERT, trained via C3
self-distillation with Qwen2.5-7B teacher on 97 carefully labeled pairs
at 33% C3 ratio.

| Metric | Value |
|---|---|
| Heretic exact (32 prompts) | 0.955 |
| Keep rate | 0.854 |
| Override delta | 0.000 |
| Agent mk_in_ref (with override) | 1.000 |
| Token savings | 15% |
| Base model | kompress-v2-base |

[Model on HuggingFace →](https://huggingface.co/PeetPedro/kompress-v8)

---

## The experiment

17 models trained. 8 teachers. 4 architectures. $38.95 total.

| Version | What we tried | Heretic | Lesson |
|---|---|---|---|
| v2 | — | 0.975 | Precision ceiling |
| v4 | Self-labels | 0.943 | Override internalized |
| v6 | Agent-distribution | 0.962 | Dead end |
| **v8** | **Qwen2.5 teacher** | **0.955** | **Production** |
| v9 | C3-only | 0.921 | Overfit |
| v11 | Larger encoder | 0.906 | Capacity ≠ precision |
| v14 | Council training | 0.882 | Concept proven |
| v16 | 10× weight | 0.972 | Pareto endpoint |

11 of 17 were dead ends. We published them all. The dead ends are the research.

---

## Open science

The interactive paper is live at **[kompress.vaked.dev](https://kompress.vaked.dev)** —
WebGL neural field background, live paradox simulation, baseline comparison.

- **Paper PDF:** [peterlodri-sec.github.io/longrun-eval-kompress/paper/main.pdf](https://peterlodri-sec.github.io/longrun-eval-kompress/paper/main.pdf)
- **GitHub:** [github.com/peterlodri-sec/longrun-eval-kompress](https://github.com/peterlodri-sec/longrun-eval-kompress)
- **Model:** [huggingface.co/PeetPedro/kompress-v8](https://huggingface.co/PeetPedro/kompress-v8)
- **All 18 models:** [huggingface.co/PeetPedro](https://huggingface.co/PeetPedro)
- **Experiment logs:** [pocoo.vaked.dev](https://pocoo.vaked.dev)

ICLR 2027 submission. All code, data, models open source.

---

This is an inner loop of the ultrawhale project. The outer loop cost
$37.19 in DeepSeek API fees for the agent that orchestrated the experiments.
The inner loop cost $1.76 in GPU compute on vast.ai RTX 4090s.
The whole thing cost less than a conference registration.

**Label quality is the bottleneck**, not model capacity or data quantity.
**Loop engineering works.** The loop shipped.

— peter

---

*This is the research paper companion post. See also: [the kompress heretic eval](/posts/2026-06-25-kompress-heretic-eval) (full experiment log), [the loop shipped](/posts/2026-06-25-the-loop-shipped) (closing essay), [LoopKit](/posts/2026-06-25-loopkit) (starter kit), and the [interactive paper](https://kompress.vaked.dev).*
