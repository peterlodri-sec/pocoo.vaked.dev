---
title: "Iterative self-labeling: how we taught a compression model to compress itself"
date: 2026-06-25
tags: [ml, kompress, headroom, fine-tuning, self-improvement, loops, build-in-public, open-source]
description: "We used kompress-v3 + a hard inference override to generate its own training labels. The model retrained on those labels reached 0.967 exact_keep_pct on adversarial prompts — and no longer needs the override. Now running v4 → v5 to see if the loop converges."
draft: false
---

The silver label problem ([previous post](/posts/2026-06-25-the-silver-label-problem)) is this: kompress was trained on Q&A compression pairs where 28% of must-keep tokens (numbers, error names, paths, flags) were labeled as "drop" because the Q&A compressor didn't need them to answer the question. The model faithfully learned the wrong policy.

We tried four training runs with different data mixes and loss weights. exact_keep_pct plateaued at 0.877-0.882 across all of them.

Then we ran Experiment A.

---

## Experiment A: use the model to label itself

The insight: kompress-v3 with the hard inference override ([PR #1400](https://github.com/headroomlabs-ai/headroom/pull/1400)) produces correct compressions. Numbers, ALLCAPS error names, paths — all forced-kept regardless of model score. If we compress the training texts with this oracle, the output is a reference with near-correct must-keep labels.

```python
def compress_with_override(text):
    # run v3 normally
    scores = model.get_scores(tokenize(text))
    keep = scores > 0.5
    # hard override: force-keep must-keep tokens
    for i, token in enumerate(tokens):
        if MUST_KEEP_RE.search(detokenize(token)):
            keep[i] = True
    return detokenize([t for t, k in zip(tokens, keep) if k])
```

We ran this on 1802 training texts on a GPU (RTX 4090, ~5 minutes). Then trained kompress-v4 on the output.

**mk_in_ref before:** 0.72 (ultrawhale Q&A references)
**mk_in_ref after:** 0.823 (self-labeled via v3+override)

Not 1.0 — the override doesn't perfectly reconstruct every must-keep token at the tokenization boundary. But 0.823 is meaningfully better than 0.72.

---

## The result

Eval on heretic-style adversarial prompts (dense with must-keep tokens: chemical formulas, memory addresses, CVEs, error codes):

| Version | Training labels | mk_in_ref | Heretic exact_pct | Override delta |
|---------|----------------|-----------|-------------------|----------------|
| v3 | ultrawhale Q&A | 0.72 | 0.942 | +0.027 |
| v3.1 | +domain data | ~0.85* | 0.925 | +0.002 |
| v3.2 | +domain, LoRA | ~0.85* | 0.929 | +0.002 |
| v3.3 | domain only | 1.00 | 0.942* | — |
| **v4** | **self-labeled** | **0.823** | **0.967** | **+0.000** |

*estimated

**The override delta for v4 is zero.** The model learned to preserve must-keep tokens on its own. It no longer needs the inference-time fallback.

This answers the central question from the silver label post: the problem was label quality, not model capacity. With mk_in_ref=0.823, the model internalized what the override was enforcing. The override becomes a defense-in-depth no-op.

---

## The iterative loop

v4 was trained using v3+override as the reference generator. But v4 is a better compressor — it preserves more must-keep tokens with higher confidence. If we use v4+override to generate v5's references, mk_in_ref should be higher. Each generation might bring the labels closer to 1.0.

This is the self-improvement loop:

```
v3 → (v3+override labels) → v4 → (v4+override labels) → v5 → ...
```

Until the override delta stays at zero and mk_in_ref stops improving. That's the convergence criterion.

**v5 result: exact_pct = 0.961, override delta = 0.000.** The loop converged. v5 is slightly worse than v4 (0.961 vs 0.967) on one prompt (SSL cert bypass regressed: 0.895 → 0.789), all others held or improved. The iterative self-labeling has a natural ceiling — the gain from v3→v4 was the large jump; v4→v5 adds noise rather than signal.

The convergence point is v4. Further iterations would need qualitatively different training data (C3 self-distillation from real production traffic), not another round of the same self-labeling loop.

---

## What this means for the architecture

The inference-time override ([PR #1400](https://github.com/headroomlabs-ai/headroom/pull/1400), approved by JerrettDavis) is still the right thing to ship:

1. **Current model is v2-base.** v4 isn't the default yet. Until it ships as the default, the override is essential.
2. **Defense in depth.** Even once v4 is default, the override costs one regex pass per chunk (~0.1ms). It catches edge cases the model hasn't seen.
3. **The override makes training possible.** Without the override at inference time, we couldn't generate good self-labels to train the next version.

The override and the training improvement are not alternatives — the override enables the training loop that makes itself redundant.

---

## Cost

| Run | Instance | Time | Cost |
|-----|---------|------|------|
| v3 training | RTX 4090 | ~15 min | $0.09 |
| v4 self-label + train | RTX 4090 | ~25 min | $0.15 |
| v5 self-label + train | RTX 4090 | ~25 min | $0.15 |
| **Total compute** | | | **~$0.55** |

All of today's training runs: $0.55. One cold brew.

---

## v5 results

*(updating when the run completes)*

| Metric | v4 | v5 |
|--------|----|----|
| mk_in_ref | 0.823 | ~0.86 (est.) |
| Heretic exact_pct | 0.967 | **0.961** |
| Override delta | 0.000 | **0.000** |
| Verdict | breakthrough | converged — ceiling reached |

---

Model: [PeetPedro/kompress-v4](https://huggingface.co/PeetPedro/kompress-v4)
Code: [ultrawhale/scripts/run_training_v4.sh](https://github.com/peterlodri-sec/ultrawhale/blob/main/scripts/run_training_v4.sh)
PR: [headroomlabs-ai/headroom#1400](https://github.com/headroomlabs-ai/headroom/pull/1400)

*Related: [The silver label problem](/posts/2026-06-25-the-silver-label-problem) · [Fine-tuning Kompress: the Sapir-Whorf case](/posts/2026-06-25-fine-tuning-kompress-sapir-whorf) · [Kompress heretic eval](/posts/2026-06-25-kompress-heretic-eval)*
