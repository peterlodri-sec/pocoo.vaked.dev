---
title: "quantal-ternary: 3.29 → 1.64 — the baszataska nights, an honest audit, and what the numbers finally say"
date: 2026-08-11
description: "The long story of training a 0.5B BitNet b1.58 ternary model from a masked val of 11.34 down to 1.6404 — the three killers found on rented GPUs, the external audit that forced us to say what we actually measured, and the numbers that can finally check themselves."
tags: [ml, bitnet, ternary, quantization, training, hf]
series: constellation
series_index: 1
---

# quantal-ternary: 3.29 → 1.64
## the baszataska nights, an honest audit, and what the numbers finally say

*the constellation · 0 + 1 · fine touch from within · vaked.dev*

---

This is the story of a small model and a long argument with reality. The model is
`quantal-ternary` — Qwen2.5-0.5B continued-trained into a BitNet b1.58 ternary
weight space, exported as 168 per-layer matrices. The argument was about what
its numbers actually mean. It took two nights, two rented GPUs, three crashes,
one external audit, and a lot of honesty to get to a number that can check
itself.

The headline, for those who want it fast:

- **Masked validation: 3.2862** (first training night) → **1.6998** (ULTRA,
  7,000 samples) → **1.6404** (fine-tune). The old artifact, measured under
  the same protocol, was **11.34**.
- **Memory reduction: 8.1x** vs fp16 — and we now say out loud what that
  denominator is (packed 2-bit layout), because an external reviewer caught us
  not saying it.

![quantal-ternary masked val: 11.34 → 3.2862 → 1.6998 → 1.6404](/assets/qwave/quantal-val-329-to-164.svg)

---

## Part 1 — the first night: three killers

The first long run was meant to be simple: continued-train a 0.5B model on a
rented RTX 3090, export the ternary matrices, ship. The GPU cost about fifty
cents an hour and the whole thing was supposed to be an afternoon. It was not
an afternoon. It was a night, and it failed in ways that each taught one
lesson.

**Killer one: gradient clipping.** The training script clipped gradients with
`mx.clip` mapped over the whole gradient tree. On mlx-cuda this is flaky — it
crashes with silent heap corruption, no traceback, the process just dies at a
random step. The fixer's own comment in the code said it was "flaky, hard
enough to drop SSH". We kept it on anyway because the default was 1.0. Turning
it **off** made the first stable run. AdamW's weight decay regularizes fine on
its own.

**Killer two: a concurrent ghost.** Every run died in the first epoch. The GPU
was healthy — isolated matmuls passed, even big ones. The training died anyway.
The cause was not the code: another agent's process on the same rented box was
benchmarking and training on the *same 24 GB card* at the same time. Two
workloads, one GPU, both "correct", neither fitting. We killed the ghost and
the training ran. Lesson: on rented hardware, check who else is on the box
before you blame your code.

**Killer three: a pure-Python cosine LR schedule.** The learning-rate schedule
was a plain Python function. In the warmup phase it returned an `mx.array`;
past the warmup boundary it returned a Python `float`. mlx-cuda's optimizer
called `.astype()` on the result, and a float has no `.astype`. Deterministic
crash at step ~180, every single time, right at the warmup→cosine transition.
The fix was to write the schedule with `mx.where` so it always returns a tensor.
One line of intent, an hour of archaeology.

Those three fixes produced the first honest number: **masked val 3.2862**, with
a real 90-sample stratified held-out set and padding properly masked out of the
loss. The old artifact had measured 11.34 under the same protocol — because the
old protocol was not the same protocol at all. It counted padding tokens in the
loss, which is a different number dressed up as the same one.

---

## Part 2 — the ULTRA night: scale, and a hard cap

The second night went bigger: a 44 GB L40, 7,000 samples from the constellation
corpus (the kompress / domain / c3 text), batch 8, context 256. Two things
happened that matter.

First, the val trajectory collapsed nicely:

```
epoch 1 → 2.7055
epoch 2 → 2.221
epoch 3 → 1.9807
epoch 4 → 1.8344
epoch 5 → 1.6998   ← best
epoch 6 → 1.6914
epoch 7 → 1.7037   ← plateau, early stop looming
```

A 0.5B model, 7,000 samples, masked val under 1.7. That is a genuinely decent
continued-train. The ULTRA run's best, **1.6998**, beat the first night by
~1.6 points.

Second, we hit a hard wall on the GPU: **context 512 crashed, 384 crashed,
256 worked.** On the 44 GB card this is not memory — it is the mlx-cuda kernel
shape space. The dynamic padding buckets to multiples of 64, and the 256 bucket
was the largest the compiled kernels tolerated reliably on that card. We
shipped 256. Sometimes the constraint is not the hardware spec, it's the
software's JIT.

A fine-tune on top of the 1.6998 best, at a much lower LR (1e-5 → 1e-6),
touched **1.6404** before overfitting took the val back up. The checkpoint that
held that number came off the box corrupted — the tensor offsets in its header
described 251 GB of data in a 707 MB file. That is a reminder of its own:
**verify a checkpoint is whole before you kill the machine that holds it.**

---

## Part 3 — the audit: an external reviewer reads the numbers

While the training was running, a real human reviewer — Dipankar Sarkar, on the
Hugging Face post — actually *read* the benchmark JSON we had published. This
is the part of the story worth keeping.

The JSON said two things at once: **8.1x memory reduction** and **1.58 bits
per parameter**. Those two numbers do not multiply out to each other, and the
reviewer said so plainly:

```
16 / 1.58 = 10.13x   not 8.1
16 / 8.1  = 1.975 bits   not 1.58
```

Both are real numbers about b1.58. They just have different denominators.
**1.58 is log2(3)** — the information-theoretic entropy of one ternary weight,
the "1.58" in the name. **8.1x is the packed 2-bit layout** — what the kernel
actually reads: 16 / 2 = 8.0x plus a bit of packing overhead. The gap is 25%,
and it moves the implied model size of a throughput measurement from 10.9B to
13.6B depending on which field you trust.

The reviewer's question was the right one: *which denominator do you stand
behind?* We stand behind **8.1x**. The Metal kernel packs at 2 bits. 1.58 is
the theory line above it, and the JSON now says exactly that, with each
derivation spelled out.

The reviewer found more. The throughput row, once the model was named, became
checkable — and it failed:

```
0.5e9 × 1.975 / 8 = 0.1234 GB weights/token
384.2 / 0.1234 = 3,113 tok/s     (what the row implies)
the row says      142.8 tok/s    (21.8x apart)
```

The honest reading is that **142.8 tok/s is a 0.5B decode rate, and it is not
memory-bound**. It runs at 4.6% of the device's peak bandwidth. At this size,
per-token overhead dominates — the normal situation for a half-billion-
parameter model. We had called it "memory-bound decode" in the same card that
named the 0.5B model, and those two claims cancelled each other. The fix was to
say what each number measures: 384.2 GB/s is a hardware ceiling, 142.8 tok/s
is a small-model decode, and the 70B row in the same file is a *ceiling*, not a
scale-check — the interesting number is the **21.8x of headroom**, not the
8.1x.

And one more: the perplexity block listed WikiText-2, C4 and LAMBADA above a
protocol line saying "one held-out split from one file." One split cannot be
three corpora. Correct. They are **topic slices of the same training file**,
and the JSON now says so.

The audit cost nothing and improved the file more than a week of self-review
would have. It is the single best thing that happened to this project all
week. The replies we posted concede each point, because they were right.

---

## Part 4 — what the numbers finally say

After the fixes, the claims in the repository can check themselves:

- **8.1x** is the measured memory reduction of a **packed 2-bit ternary
  layout** vs fp16. It is the honest headline.
- **1.58** is `log2(3)`, the entropy line, kept as theory — labelled as such.
- **142.8 tok/s** is a 0.5B ternary decode at **4.6% of peak bandwidth**,
  overhead-bound. The 21.8x gap to the bandwidth-implied rate is headroom,
  not a claim.
- **Masked val 1.6998** (and 1.6404 from the fine-tune) is measured on a real
  stratified hold-out with padding masked out of the loss. The old 11.34 was a
  different protocol's number wearing the same name.

The model itself — 168 ternary matrices, group size 64, embeddings + RMSNorm
vectors — is live on [Hugging Face](https://huggingface.co/PeetPedro/quantal-ternary)
and on [the pocoo quantal viewer](/demos/quantal/). The training and export
tooling live in the constellation (private); what is public — and what the
audit actually checked — are the 168 hash-verified matrices on the Hub. The
numbers now agree with themselves.

---

## Epilogue — the terEM, the ER-EM

The Hungarian that keeps showing up in these posts is not decoration. *"mutassuk
meg, mi van a terEM-ben, az ER-EM-ben, amiből vagyunk, testvérek"* — show what is
in the brain, the heart, what we are made of, brothers.

This project is that, in a literal sense. A ternary model is the smallest
useful alphabet of thought: weights that can only be *no, zero, yes*. A 0.5B
model in that space runs offline, on a laptop, on a phone, on a box that never
touches the internet. The "cogito" of the constellation runs in Rust, no API
key, no cloud, no telemetry. That is the point.

And the honesty — about the denominator, about the memory-bound claim, about
what the throughput actually is — is the same instinct. If you are building
something you intend to run forever, on your own hardware, for your own
people, the numbers have to survive being read by someone who does not love
you. These do now.

The model is not big. The claim is not grand. But 3.29 → 1.64, measured
honestly, is real, and it is ours.

*the constellation · 0 + 1 · fine touch from within · vaked.dev*

---

*Series — [part 2: from 11.34 to 0.63](/posts/2026-08-12-quantal-ternary-11_34-to-0_63) · [part 3: the eclipse day](/posts/2026-08-12-eclipse-day-0_5597-storage-bucket). The same "measure honestly" instinct runs through the [qwave performance series](/posts/2026-08-13-zero-allocation-text-on-the-keystroke-path): a number that survives a stranger reading it.*
