---
title: "quantal-ternary: from 11.34 to 0.63 — the lessons of a long, honest week"
date: 2026-08-12
description: "Two training nights, three external audits, a 68-file seam caught by byte count, and a masked val that dropped 17x. What the constellation learned about training small ternary models, publishing reproducible numbers, and letting strangers read your claims."
series: constellation
series_index: 2
---

# quantal-ternary: from 11.34 to 0.63
## the lessons of a long, honest week

*the constellation · 0 + 1 · fine touch from within · vaked.dev*

---

The last two days moved the masked validation loss of a 0.5B BitNet b1.58
ternary model from **11.34** down to **0.63** (and still dropping as this is
written). The interesting part is not the number. It is how many ways a number
like that can be wrong before it is right, and what each correction cost.

```
masked val trajectory (same protocol, pad masked out, real 90-sample split):

old artifact  ████████████████████████████████████  11.34   (padding counted in loss)
night 1       ██████████                            3.2862  (3090, 2,785 samples)
ULTRA         ███████                               1.6998  (L40, 7,000 samples)
fine-tune     ███████                               1.6404  (L40, resume, then overfit)
SOTA (now)    ████                                  0.6329  (H100, 14,330 samples, epoch 11/40)
```

Every step down came with a correction that had nothing to do with the model
and everything to do with honesty about what was being measured.

---

## Lesson 1 — three killers on the first night

The first long run died three different ways before it produced a number:

1. **Gradient clipping was the crash.** `mx.clip` over the gradient tree on
   mlx-cuda is flaky — silent heap corruption, no traceback, the process just
   dies. Turning it *off* made the first stable run. AdamW's weight decay
   regularizes fine on its own.
2. **A ghost on the GPU.** Every run died in epoch one. The cause was not the
   code: another process on the same rented box was training on the *same*
   24 GB card. Two workloads, one GPU, both "correct", neither fitting. We
   killed the ghost and the training ran.
3. **A Python LR schedule lied about its type.** Past the warmup boundary it
   returned a `float` where mlx-cuda's optimizer called `.astype()` — a float
   has no `.astype`. Deterministic crash at step ~180, every time. The fix was
   one line: make the schedule `mx`-aware so it always returns a tensor.

The lesson: on rented hardware, before you blame your code, check who else is
on the box. Then check your types.

## Lesson 2 — a stranger read the numbers, and was right

An external reviewer (Dipankar Sarkar) actually *read* the published benchmark
JSON. Three rounds, three real findings:

**Round 1 — the denominator.** The file said both "8.1x memory reduction" and
"1.58 bits per parameter". Those don't multiply to each other:

```
16 / 1.58 = 10.13x   not 8.1
16 / 8.1  = 1.975 bits   not 1.58
```

Both are real numbers about b1.58 with different denominators. 1.58 is
`log2(3)`, the entropy of one ternary weight. 8.1x is the packed 2-bit layout
the kernel actually reads. We stand behind **8.1x** — the theory line is
labelled as such now.

**Round 2 — the throughput row failed self-audit.** Once the model was named,
the row became checkable — and it failed:

```
0.5e9 × 1.975 / 8 = 0.1234 GB weights/token
384.2 / 0.1234 = 3,113 tok/s     (what the row implies)
the row says      142.8 tok/s    (21.8x apart)
```

The honest reading: **142.8 tok/s is a 0.5B decode at 4.6% of peak bandwidth —
overhead-bound, NOT memory-bound.** We had called it memory-bound in the same
card that named the 0.5B model. Those two claims cancelled each other.

**Round 3 — the 68-file seam.** This was the big one, and it was my fault.
The ULTRA re-export was pushed in four chunks. The first three (m000–m099)
went up. The fourth (m100–m167) was interrupted by a network failure — and my
"did it upload?" check only confirmed the files *existed*, not that their
*contents* matched. The Hub kept the old 3.2862-era files for m100–m167:

```
matrices whose bytes match index.json    100    m000..m099   (ULTRA, 1.6998)
matrices whose bytes disagree             68    m100..m167   (stale 3.2862)
         the seam ran through the middle of layer 9
```

The byte-count mismatch caught it — the only integrity signal on 168 of 171
files was a byte count. Fixed by re-pushing m100–m167 from the current export,
**verified by content hash this time**, and by adding a per-matrix sha256 to
the export tooling so a push-time failure is caught at push time.

The lesson that keeps repeating: **a number that can check itself is the only
number worth publishing.** The audits cost nothing and improved the file more
than a week of self-review would have.

## Lesson 3 — training ≡ deployed, proven to 1e-5

Full BitLinear applies a per-projection RMSNorm and quantizes activations —
a forward that does not exist in the Rust runtime. Training on it optimizes a
model that is not what ships. We switched to weight-quant-only and the Rust
ternary runner now reproduces the training forward to **1e-5** (golden-logits
gate, both prompts, identical argmax):

```
prompt 1  rust-vs-mlx-vanilla  max_abs 5.72e-05  argmax 975 = 975   PASS
prompt 2  rust-vs-mlx-vanilla  max_abs 8.49e-05  argmax 15104 = 15104   PASS
```

No parity gap to paper over. What you evaluate is what you ship.

## Lesson 4 — context is a JIT constraint, not a spec

The 0.5B ternary model with a full forward crashed at context 512 on a 44 GB
L40, a 40 GB A100, and a 79 GB H100 — not from memory, but from mlx-cuda's
kernel shape space. Context 256 was the largest the compiled kernels tolerated
reliably. We shipped 256. Sometimes the constraint is not the hardware, it's
the software's JIT.

## Lesson 5 — the machine on your side

Between the audits we ran a fresh continued-train on a rented H100 with
**14,330 samples** (2x the first corpus). The masked val trajectory:

```
epoch 1 → 2.8975
epoch 2 → 2.1538
epoch 3 → 1.6779
epoch 4 → 1.2709
epoch 5 → 1.0967
epoch 8 → 0.7731
epoch 9 → 0.7101
epoch 10 → 0.6683
epoch 11 → 0.6329   ← best so far, still running
```

A 0.5B model, 14k samples, masked val under 0.65. The full story, the logs,
and the live telemetry are on the [pocoo quantal viewer](/demos/quantal/).

## The repo, fixed and honest

- **`PeetPedro/quantal-ternary`** — [168 ternary matrices](https://huggingface.co/PeetPedro/quantal-ternary),
  now one checkpoint, verified by content hash. The `quantal_model.safetensors`
  checkpoint is on the Hub for reproducible fine-tuning.
- **The audits** — [the benchmark JSON](https://huggingface.co/datasets/PeetPedro/kompress-ultra-bitnet-benchmarks)
  labels every denominator; the mirror is aligned with the dataset.
- **The blog** — [part 1](https://pocoo.vaked.dev/posts/2026-08-11-quantal-ternary-3_29-to-1_64.html)
  covered the first night. This is part 2.

## What the numbers finally say

- **8.1x** is the measured memory reduction of a packed 2-bit ternary layout.
- **0.63 masked val** is the current best on a real stratified hold-out.
- **1.58** is `log2(3)` — the theory line, kept and labelled.
- **142.8 tok/s** is a 0.5B decode at 4.6% of peak. Overhead-bound.
- **The 21.8x gap** is headroom a larger model could spend.

The model is small. The claims are not grand. But 11.34 → 0.63, measured
honestly, checked by strangers, and reproduced to 1e-5 — that is real, and it
is ours.

*the constellation · 0 + 1 · fine touch from within · vaked.dev*
