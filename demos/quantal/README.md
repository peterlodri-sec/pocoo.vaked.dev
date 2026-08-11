---
license: mit
language:
- en
- hu
library_name: mlx
tags:
- bitnet
- b1.58
- ternary
- quantization
- mlx
- apple-silicon
- llm
- sovereign
- constellation
pipeline_tag: text-generation
datasets:
- PeetPedro/ultrawhale-dogfood
base_model: Qwen/Qwen2.5-0.5B
model_creator: peterlodri-sec
quant_method: ternary
---

# quantal-ternary

A **BitNet b1.58** ternary model — Qwen/Qwen2.5-0.5B, continued-trained and
quantized to **{-1, 0, +1}** weights. Exported as 168 ayeOS ternary matrices
(24 layers × 7 tensors) plus the runtime assets (token embeddings + RMSNorm
vectors). Part of the vaked constellation — the "cogito" that runs offline in
Rust.

## Model

| | |
|---|---|
| Base model | `Qwen/Qwen2.5-0.5B` |
| Quantization | weight-quant-only ternary `{-1,0,+1}` (group size 64) |
| Matrices | 168 ayeOS per-layer files (`m000.json` … `m167.json`) |
| Runtime assets | `embeddings.f16` `[151936, 896]`, `norms.f32` `[49, 896]` |
| Training | continued-train, masked CE, deployed-forward QAT |
| Validation (masked, n=90) | **1.6998** |
| Checkpoint sha256 | `2d54a10f9dbda3502a2914375d97a7bd13e1f7d30728b17508bc011879825c4c` |

## Training

- **Data**: 7,000 text samples (konstellation corpus: kompress + domain + c3,
  same-period as the base), stratified 90-sample held-out val.
- **Loss**: masked cross-entropy — pad tokens (id 0) weighted out, honest mean
  over valid tokens. Dynamic per-batch padding bucketed to multiples of 64.
- **Optimizer**: AdamW, weight decay 0.1, grad clip off, lr 3e-4 → cosine →
  3e-5 (2% warmup), early stop patience 5 / min-delta 0.05, 40-epoch cap.
- **Hardware**: vast.ai L40 (44 GB) — "ULTRA LOVEGOD MODE" run, B8/256.
- **Forward**: deployed-forward QAT — the exact forward the Rust runner uses
  (weight-quant-only BitLinear, per-projection RMSNorm + activation quant
  skipped), so training ≡ inference.
- **Val trajectory** (ULTRA run): 2.71 → 2.22 → 1.98 → 1.83 → **1.70** → 1.69
  → 1.70 (plateau) — best **1.6998** at epoch 5. Prior night's run (2,785
  samples, masked val 3.2862) was superseded; the old artifact measured 11.34.

## Layout

```
m000.json … m167.json   168 ternary matrices (packed codes + per-group scales)
index.json              capsule metadata + file manifest (sha256, shapes)
embeddings.f16          token embedding matrix, BF16→FP16, [151936, 896]
norms.f32               49 RMSNorm gain vectors (24×2 + final), [49, 896]
```

`norms.f32` row ordering: row `2i` = layer `i` input_layernorm, row `2i+1` =
layer `i` post_attention_layernorm, row 48 = final `model.norm.weight`.

## Runtime

Consumed by the entheai Rust ternary runner (`crates/ternary`) and the
`pocoo.vaked.dev/demos/quantal` live viewer. The same export tooling
(`export_quantal_checkpoint.py` + `export_quantal_assets.py`) produced this
repo from the winning checkpoint.

> Part of the vaked constellation — sovereign, offline, fine.
