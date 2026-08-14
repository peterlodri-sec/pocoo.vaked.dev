---
title: "quantal-ternary: four nights of training, three dead GPUs, and the format that finally earned its third bit"
date: 2026-08-14
description: "The full engineering history of the quantal nightly runs — from 11.34 masked val through a thresholded-ternary rewrite, a GPU that died mid-epoch, a stranger who counted zeros in the published bytes, and the 1.3e-5 parity gate that finally made training equal deployment. Every number, every crash, every fix."
series: constellation
tags: [ml, bitnet, ternary, quantization, training, engineering, rust, hf]
series_index: 4
---

# quantal-ternary: four nights of training, three dead GPUs, and a format that finally earned its third bit

## the complete engineering history of the nightly runs

*the constellation · 0 + 1 · fine touch from within · vaked.dev*

---

This is the story of four nights of training a 0.5B BitNet b1.58 ternary
model — not the glossy version, but the full engineering record: every
number, every crash, every dead GPU, every fix, and the one external audit
that changed the quantizer. If you are training small quantized models,
renting GPUs, or publishing reproducibility claims, some of this will hurt
in a familiar way.

---

# Part I — the protocol

## What we are actually training

`quantal-ternary` is a Qwen2.5-0.5B continued-trained as a BitNet b1.58
ternary model. The export format — ayeOS — is 168 packed matrices: 24 layers
× 7 tensors (attention q/k/v/o, MLP up/gate/down). Each matrix stores
2-bit ternary codes and per-64-group scales:

```
mNNN.json:
  name          "model.layers.23.mlp.up_proj"
  dim           4864          (output rows)
  in_features   896           (input cols)
  group_size    64
  codes         u32 array, 16 codes per word, LSB-first, row-major over K
  scales        f32 array, one per 64-column group per row
  value         = (code − 1) × scale
  code0 = −1    code1 = 0    code2 = +1    code3 = never
```

Total resident: ~107 MiB — small enough that the Rust runner can hold it in
memory and think with it offline. That was always the point: a model the mesh
can run natively in Rust, no Python, no MLX, no cloud.

## The masked-CE protocol

The loss is masked cross-entropy over valid tokens — pad tokens (id 0) are
weighted out so padding never inflates the apparent performance. This was the
first honesty fix of the whole project: the original artifact measured 11.34
masked val *because padding was counted in the loss*. The number was a lie
the metric told us about ourselves.

Validation is a stratified 90-sample held-out split (5 token-length buckets,
seed 42), evaluated on every epoch. Early stopping: patience 5, min-delta
0.02. Dynamic per-batch padding, bucketed to multiples of 64 — a detail that
matters more than it should, because mlx-cuda's JIT kernel cache crashes on
unbounded shape variety.

## The deployed-forward decision

The single most important architectural decision: the trained forward and the
deployed forward are *the same forward*. Weight-quant-only BitLinear — no
per-projection RMSNorm, no activation quant. What you train is what the Rust
runner runs, by construction. This is what made a 1e-5 parity gate possible
at all, and it is also what a stranger on the Hub would later force us to
make *honest*.

---

# Part II — the nights

## Night 1 — three killers

The first long run died three different ways before producing a number:

1. **Gradient clipping was the crash.** `mx.clip` over the gradient tree on
   mlx-cuda is flaky — silent heap corruption, no traceback, the process just
   dies. Turning it *off* made the first stable run. AdamW's weight decay
   regularizes fine on its own.
2. **A ghost on the GPU.** Every run died in epoch one. The cause was not our
   code: another process on the same rented box was training on the *same*
   24 GB card. Two workloads, one GPU, both "correct", neither fitting. We
   killed the ghost and training ran.
3. **A float LR schedule.** The pure-Python cosine schedule returned a Python
   `float` past warmup; `apply_single`'s `.astype` then crashed on the mixed
   type. The schedule had to be mx-aware — always an `mx.array`.

Result: **3.2862** masked val on a 3090, 2,785 samples. Down 3.4× from the
lie.

## Night 2 — ULTRA

A larger run: L40, 7,000 samples, the full corpus construction (kompress +
domain + c3). Result: **1.6998**. Then a fine-tune resume pushed to 1.6404
before overfitting — and the checkpoint that came back was *corrupt*
(707 MB with 251 GB of tensor offsets). The file looked fine by size; the
offsets were nonsense. We discarded it and kept 1.6998 as the live number.

Lesson: **a checkpoint is not real until its offsets validate.** Byte counts
lie. We would learn this lesson again, harder.

## Night 3 — SOTA, then the H100 died

The SOTA run: H100 (80 GB), 14,330 samples, batch 8 / max-len 256. The val
trajectory was the most beautiful thing we had seen:

```
2.90 → 1.68 → 1.27 → 0.77 → 0.67 → 0.63 → 0.60 → 0.5597  (epoch 21, early stop)
```

**0.5597.** An 11.34-to-0.56 story, 20×. We published it, ran the parity gate
(Rust vs MLX-vanilla, 1e-5), updated the card, pushed to HF.

And then the H100 started throwing `cudaGraphAddKernelNode: illegal
instruction` and `cudaGraphAddDependencies: invalid argument`. The box died
mid-run. The instance that trained the best model was gone, and with it the
run's live state — but we had the 0.5597 final locally, and that was enough.

Or so we thought.

## The stranger who counted the zeros

Dipankar Sarkar range-read the published model — no download, just the
header and a tensor slice — and unpacked one exported matrix. He did not
need our loader, our training code, or our claims. He read the bytes. His
findings were devastating and precise:

- The scale array, 68,096 entries, held **two distinct values**
  (0.0164794921875 ×68084 and 0.0162353515625 ×12 — both multiples of
  1/65536). The `[4864][14]` scale block was, in his words, "a scalar
  wearing a shape".
- The codes were a **sign matrix**, not ternary: 2,178,480 × −1, 2,179,652 ×
  +1, and **12 zeros** in 4.36 million weights. The zero state of a 2-bit
  format was used once in 360,000.
- The 12 minority-scale rows were *exactly* the 12 zero-code rows — a row
  hit the lower scale bucket precisely when it contained a weight that
  rounded to zero.
- The published blob and the exported matrices were **different checkpoints**
  — sign agreement 0.86, misses concentrated in the bottom |w| decile, which
  is exactly where a weight sits near its own sign boundary.

And then the question that changed the code:

> "Does this model ever want a zero? If the trained weights are all at plus
> or minus one scale, b1.58 is doing b1 work, and the third state is a slot
> you are paying for in every file."

## The third state was never used — by construction

The old `weight_quant` was:

```python
scale = mx.abs(w).mean()
shifted = w - w.mean()
return mx.sign(shifted) * scale
```

A value was +scale or −scale unless it landed *exactly* on the mean. The
third code — the zero — was a slot the format paid for and the quantizer
never used. The "polarization" Dipankar saw was not a property of the trained
weights; it was the quantizer hiding the b1.58 third state by construction.

We measured the latent weight distribution directly. On the first layer's
21M weights, **34.25% sit below 0.5·scale** — they want the zero state. A
sweep of a real ternary threshold confirmed it:

```
quantizer           MAE       zero fraction
sign-based (old)    0.01005   0.00%
ternary t=0.5       0.00753   31.8%
ternary t=1.0       0.00961   58.5%
```

The model wanted zeros — about a third of it. The format was paying for a
third state it never used, and the quantizer was the reason.

## Night 4 — the rebuild

We rewrote `weight_quant` as a true thresholded ternary, per 64-column group,
matching the ayeOS scale layout the Rust runner dequantizes:

```python
scale_g = mean(|w|) over the group
q = 0            if |w| < 0.5·scale_g
    sign(w)·scale_g  otherwise
```

Training forward ≡ export ≡ Rust by construction. The results on the nightly
run (RTX PRO 6000, 20,007 samples):

- **Zero fraction ~30%** (was 2.75e-6). The third state became real.
- **62,120 distinct scales** (was 2). The scale array carried data again.
- **Quantization MAE 2.4× lower** on the trained weights.
- Best masked val **2.1469** (epoch 2 — the run overfits after that; the
  curve is the honest shape of a small-corpus continued-train).
- **Parity gate: 1.3e-5** — tighter than any previous run (was 9.6e-5).

The bleeding-edge variant (lr 5e-5 instead of 3e-4) converged slower and
landed at 2.3112. The higher LR found the better optimum faster. **2.1469
stood.**

---

# Part III — the infrastructure war

This section is for anyone who has rented a GPU at 2 AM.

## mlx-cuda: the graph cache is not a suggestion

The first nightly died with:

```
RuntimeError: Cache thrashing is happening, please set the environment
variable MLX_CUDA_GRAPH_CACHE_SIZE to a larger value than 400.
```

We set `MLX_CUDA_GRAPH_CACHE_SIZE=2000` and the run survived — at a cost:
steps/sec dropped from 9.4 to 1.4. The graph cache was the difference between
a 2-hour run and a 4-hour run. It was also the difference between a run and
no run. We paid the tax.

## The cudnn whack-a-mole

The parity-test Python environment needed `torch` — and installing torch
pulled `nvidia-cudnn-cu12==8.9`, which silently broke the mlx-cuda import:

```
ImportError: undefined symbol: cudnnBackendPopulateCudaGraph
```

mlx-cuda 0.30 wanted cudnn 9; torch's wheel dragged in cudnn 8. The fix was
`pip install nvidia-cudnn-cu12==9.*`. The same class of error — a library
that was *installed* but *wrong-versioned* — took three separate debugging
rounds across the nights.

## Three dead GPUs

Across the four nights, the vast.ai fleet ate: an H100 (died mid-epoch with
illegal-instruction graph errors), an A100-40GB and a 4090D (ECC + illegal
memory on the first `loss.item()`), and an L40S. The one card that held:
an RTX PRO 6000. Not the flashiest, not the cheapest — the one that stayed
alive. There is a lesson there about renting on the margin: **the most
expensive GPU is the one that dies at epoch 7.**

## The cudnn 9 → cudnn 8 → cudnn 9 dance, the sequel

The bleeding-edge run used a different Python (3.11) than the nightly (3.10),
and the CUDA 13.2 driver on the new box rejected the mlx-cuda wheels built
for CUDA 12.9. After the torch install clobbered cudnn again, the run died
before the first epoch with the same `cudnnBackendPopulateCudaGraph` symbol.
Reinstalling cudnn 9 fixed it. The pattern is now in the runbook: **check
cudnn 9 before you check your model.**

---

# Part IV — the gates

## The parity gate that finally meant something

The deployed model must match the trained model. Our gate: run the same two
gate prompts through (a) the MLX reference and (b) the Rust runner, compare
final-token logits.

The nightly's fresh export:

```
prompt 1: max_abs 1.335e-05  argmax 71703 = 71703  PASS
prompt 2: max_abs 1.335e-05  argmax 71703 = 71703  PASS
```

**1.3e-5.** The Rust runner and the MLX reference agree to four decimal
places on a 151,936-token vocabulary. That is not luck; that is the
deployed-forward decision paying off.

And the same checkpoint now loads into a PyTorch `BitNetForCausalLM` at
**6.5e-06** — once the transformers bitnet module honours
`use_sub_norms=False`. Which was itself a bug hunt: PyPI 5.15's
`BitNetMLP` unconditionally applied the sub-layer RMSNorm regardless of the
config flag, and only the dev branch (now PR
[#47955](https://github.com/huggingface/transformers/pull/47955)) got it
right. The fix: the module has to *not exist*, not be neutralised — an
RMSNorm initialised to ones still normalises.

## The manifest ordering fix

Dipankar's second finding: the `index.json` manifest was written with
`export_complete: true` in the *first* commit, before 112 of the files it
described existed. Anyone cloning during that eight-minute window got a
manifest vouching for files that were not there. The fix is ordering, not
hashing: **push assets first, the manifest last**, and set
`export_complete: true` only after the content checks pass. The window
closes by construction.

---

# Part V — the numbers, honestly

```
masked val trajectory (same protocol, pad masked out, real 90-sample split):

old artifact  ████████████████████████████████████  11.34   (padding counted)
night 1       ██████████                            3.2862  (3090, 2,785)
ULTRA         ███████                               1.6998  (L40, 7,000)
SOTA          ████                                  0.5597  (H100, 14,330)
nightly       █████                                 2.1469  (RTX PRO 6000, 20,007, epoch 2)
bleeding-edge █████                                 2.3112  (same, lr 5e-5, epoch 6)
```

Two numbers need explanation:

1. **Why is the nightly (2.1469) higher than the SOTA (0.5597)?** Because the
   SOTA number was produced by a quantizer that never used its third state —
   it was measuring a *de facto binary* model with a sign-collapsed
   quantizer. The nightly is a *real* ternary model: ~30% zeros, 62k
   distinct scales, 2.4× lower quantization MAE. The 2.1469 is not lower; it
   is honest. And it beats the old QUANT-ULTRA baseline (2.6466) on the same
   corpus.

2. **Why is the bleeding-edge (2.3112) higher than the nightly (2.1469)?**
   Because a lower LR (5e-5 vs 3e-4) converged slower on a 20k-sample
   continued-train and overfit later — landing on a worse optimum at early
   stop. Sometimes the aggressive LR wins. We measured it; we kept the
   aggressive one.

The published best: `21294c68…8285`, masked val 2.1469. The blob, the card,
and the matrices describe the same tensor — after the manifest fix, for the
first time.

---

# Part VI — what the format got paid

The reply to "does this model ever want a zero?" is: **yes, a third of it,
and the format now gets paid.**

- The 2-bit payload earns its second bit — the zero state is 30% of the
  weights, not 1-in-360,000.
- The scale array earns its shape — 62,120 distinct values, not 2.
- The quantization earns its budget — MAE down 2.4× on the trained weights.
- The parity gate earns its claim — 1.3e-5, the tightest of the project.

And the whole pipeline — training, export, parity, publish, transformers
port — is now captured as a reusable skill, plugin, and kickoff prompt in
the repo, so the next nightly starts from a checklist, not from memory.

---

## The thread

The constellation's quantal thread:
[from 3.29 to 1.64](/posts/2026-08-11-quantal-ternary-3_29-to-1_64.html) →
[from 11.34 to 0.63](/posts/2026-08-12-quantal-ternary-11_34-to-0_63.html) →
[the third state is real](/posts/2026-08-13-quantal-ternary-third-state-is-real.html) →
this one.

Every correction had nothing to do with the model and everything to do with
honesty about what was measured — the padding in the loss, the byte counts
that lied, the third state that was never used, the manifest that vouched too
early. A stranger read the bytes and asked the right question. The format
finally earns its third bit.

*the constellation · 0 + 1 · fine touch from within · vaked.dev*
