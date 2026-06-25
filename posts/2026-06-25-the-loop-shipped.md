---
title: "The loop shipped. Here's what it produced."
date: 2026-06-25
tags: [kompress, loop-engineering, research, iclr, compression, paradox]
description: "We closed the loop. 17 models, 8 teachers, 4 architectures, $38.95 total. The manuscript is written, the baselines are run, the paradox is proven, the fix works."
draft: false
---

We closed the loop. 17 models, 8 teachers, 4 architectures, $38.95 total. The manuscript is written, the baselines are run, the paradox is proven, the fix works.

---

## What we built

- An ICLR 2027 manuscript proving the Voting Ensemble Paradox
- [kompress-v8](https://huggingface.co/PeetPedro/kompress-v8): a production compression model (0.955 heretic exact, 1.000 agent mk_in_ref with override)
- [LoopKit](https://github.com/peterlodri-sec/loopkit) — a loop-experiment-researcher template so anyone can scaffold from here
- Interactive docs, a Colab notebook, a Telegram bot with council, an MCP-ready evaluation server
- 18 model cards on [HuggingFace](https://huggingface.co/PeetPedro) with full benchmarks, training details, and cross-references

---

## What we learned

**Label quality is the bottleneck.** Not model capacity (v11: ModernBERT-large, 352M params, collapsed to 0.906). Not data quantity (v15: 983 pairs, regressed to 0.878). Only label-quality interventions worked:

| Intervention | Version | Heretic | Δ |
|---|---|---|---|
| Self-labeling | v3→v4 | 0.942→0.943 | +0.001 |
| C3 distillation (Qwen teacher) | v8 | 0.955 | +0.012 |
| λ-ablation (loss weight) | v8→v17→v16 | 0.955→0.963→0.972 | +0.017 |

The λ-ablation mapped the full Pareto frontier: higher must-keep weight in the loss function improves heretic precision linearly but kills compression. At 3x (v8): 0.955 heretic, 15% compression. At 5x (v17): 0.963 heretic, 3.7% compression. At 10x (v16): 0.972 heretic, 2.8% compression. The tradeoff is fundamental — you cannot have perfect precision and aggressive compression simultaneously with this architecture.

**The dead ends are the research.** 11 of 17 models were dead ends. We published them all:

| Version | Attempt | Heretic | Lesson |
|---|---|---|---|
| v6 | Agent-distribution training | 0.962 | Dead end — more conservative |
| v7 | Sliding-window self-labeling | 0.956 | Dead end — regressed precision |
| v9 | C3-only, no generic | 0.921 | Overfit — need diversity |
| v11 | Larger encoder (352M) | 0.906 | Capacity ≠ precision |
| v12 | Qwen3-Coder teacher | 0.949 | Teacher too conservative |
| v13 | GLM scenarios + regex | 0.951 | Regex teacher too conservative |
| v14 | Council-controlled training | 0.882 | Concept proven, needs work |
| v15 | Everything bagel (983 pairs) | 0.878 | More data ≠ better |

Every dead end taught us something. The loop doesn't produce models — it produces understanding.

---

## What's next

The loop has stopped improving. v8 is the production model — 0.955 heretic exact, 1.000 agent mk_in_ref with the [must-keep override](https://github.com/headroomlabs-ai/headroom/pull/1419), 15% token savings. The Voting Ensemble Paradox is proven. The paper is written.

But the loop pattern itself is now open source. [LoopKit](https://github.com/peterlodri-sec/loopkit) — part of the growing loop engineering ecosystem with [Addy Osmani](https://addyosmani.com/blog/loop-engineering/), [LangChain](https://www.langchain.com/blog/the-art-of-loop-engineering), and [Cobus Greyling](https://github.com/cobusgreyling/loop-engineering) — is available for anyone to clone and extend. Build your own loop. Find your own v8.

Until the next loop starts.

— peter

---

*This post is the closing entry in the kompress experiment. See also: [the heretic eval](/posts/2026-06-25-kompress-heretic-eval), [LoopKit](/posts/2026-06-25-loopkit), [all 18 models on HuggingFace](https://huggingface.co/PeetPedro), [the ultrawhale training repo](https://github.com/peterlodri-sec/ultrawhale), and [headroom](https://github.com/headroomlabs-ai/headroom).*
