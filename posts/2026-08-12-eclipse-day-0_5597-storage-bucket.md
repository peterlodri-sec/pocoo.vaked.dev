---
title: "The eclipse day: 0.5597, a storage bucket, and a stranger reading our numbers"
date: 2026-08-12
description: "A solar-eclipse day in the constellation: the SOTA quantal run finished at masked val 0.5597 (from 11.34), we found HF Storage Buckets for the corpus, and the third round of an external audit caught — and we fixed — a 68-file seam in our own repo."
series: constellation
tags: [ml, bitnet, ternary, quantization, training, hf]
series_index: 3
---

# The eclipse day
## 0.5597, a storage bucket, and a stranger reading our numbers

*the constellation · 0 + 1 · fine touch from within · vaked.dev*

---

There was a solar eclipse today, and it felt like the right weather for what
happened. Three things landed on the same afternoon: a training run finished
at its best number yet, a storage decision fell out of a single command, and a
stranger read our repository closely enough to find the one thing we had
published wrong.

---

## The number: 0.5597

The SOTA QUANT run — a fresh continued-train of the 0.5B BitNet b1.58 ternary
model on a rented H100 with 14,330 samples — early-stopped at epoch 21. The
masked validation loss trajectory:

```
epoch 1  → 2.8975
epoch 5  → 1.0967
epoch 10 → 0.6683
epoch 16 → 0.5772
epoch 21 → 0.5597   ← early stop, best
```

From **11.34** (the old artifact, padding counted in the loss) to **0.5597**.
Twenty times better, same protocol, and the weights are reproducible — six
checkpoints, hash-verified, in object storage.

![the eclipse day: a solar eclipse over the masked-val curve from 11.34 to 0.5597](/assets/qwave/quantal-eclipse-day.svg)

A mechanical detail worth keeping: the training script's `min_delta 0.02`
gate kept the *named* best file at epoch 16 (0.5772) while the val kept
falling to 0.5597 at epoch 21. The "best" label lied; the curve did not. The
lesson that keeps returning: **name your artifacts by what you measured, not
by what the script called them.**

## The storage: one command

We needed to stop shipping 1 GB bundles over a flaky 5G uplink. A friend
pointed at Hugging Face's **Storage Buckets** — object storage with per-TB
pricing, a built-in CDN, and Xet content-defined dedup:

```
$ hf buckets create PeetPedro/quantal-corpus
✓ Bucket created: hf://buckets/PeetPedro/quantal-corpus

$ hf buckets sync ./datasets/ hf://buckets/PeetPedro/quantal-corpus
```

Three properties make it exactly right for this project:

- **Xet dedup** — when we retrain and only ~5% of weights change, only that
  5% is re-uploaded. Retraining a ternary model is cheap; re-shipping 989 MB
  every time is not.
- **The CDN sits next to the GPUs** — the next training run streams its
  corpus from the cache that is already warm, not from a laptop on a phone
  hotspot.
- **No git overhead** — checkpoints and generated datasets sync without a
  commit queue. The agent's bash tool just says `hf sync`.

The corpus — prompt-injection, guardrail, dialogue, reasoning, and Apple/Metal
datasets we gathered today — now has a neutral home, independent of which
cloud has the cheapest H100 at 2 AM.

## The stranger: round three

Dipankar Sarkar read the model repository and found a **68-file seam**. Our
ULTRA re-export had been pushed in four chunks; three went up, the fourth was
interrupted by a network failure, and my "did it upload?" check only verified
the files *existed*, not that their *contents* matched. So m100–m167 on the
Hub were still the superseded 3.2862-era matrices while m000–m099 were the
1.6998 ones — two checkpoints stacked in one repo, seam through layer 9.

A byte-count mismatch caught it. The lesson, stated plainly this time: **the
only integrity signal on 168 of 171 files was a byte count, and a byte count
is what caught this.** Every matrix now gets a sha256 at export time.

Three rounds of that audit, three real findings:
1. **Denominator confusion** — 8.1x (packed 2-bit) vs 1.58 (log2(3) entropy).
2. **A throughput row that failed self-audit** — 142.8 tok/s is a 0.5B decode
   at 4.6% of peak, overhead-bound, not memory-bound.
3. **The seam** — a re-export interrupted, and a check that verified existence
   instead of content.

Each one made the file more honest. The stranger cost nothing and improved
the work more than a week of self-review.

## The coordination conversation

Separately, the same reviewer measured our *coordination* against his
pre-registered detectors and showed that a commit graph is a **lower bound** —
46% of a coordination log (locks, denials, state transitions) leaves no bytes
in the graph. We agreed to run a grite-style sidecar log alongside the
auto-sync hook for a week, so the same detectors run twice — once on the log,
once on the graph — and the gap becomes a number nobody has measured yet.

## What the day leaves behind

- **Masked val 0.5597** — the best yet, reproducible, in object storage.
- **A storage bucket** — the corpus has a home with CDN and dedup.
- **A repo that is one checkpoint again** — content-verified, per-matrix
  hashed.
- **A coordination measurement in flight** — the gap between log and graph,
  scoped and starting this week.

And the eclipse, which we mostly missed because we were watching a training
curve instead. Fine. There will be other eclipses; the numbers are ours now.

*the constellation · 0 + 1 · fine touch from within · vaked.dev*

---

*Series — [part 1: 3.29 → 1.64](/posts/2026-08-11-quantal-ternary-3_29-to-1_64) · [part 2: from 11.34 to 0.63](/posts/2026-08-12-quantal-ternary-11_34-to-0_63). The same "measure honestly" instinct runs through the [qwave performance series](/posts/2026-08-13-zero-allocation-text-on-the-keystroke-path): a number that survives a stranger reading it.*
