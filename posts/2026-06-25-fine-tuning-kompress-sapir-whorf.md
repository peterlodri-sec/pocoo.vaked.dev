---
title: "Fine-tuning Kompress: the Sapir-Whorf case for better compression"
date: 2026-06-25
tags: [ml, fine-tuning, kompress, headroom, language, loops, pytorch]
description: "Language shapes thought. Bad compression builds a linguistically impoverished environment for your agent. Here's how we fine-tuned Kompress v2 to fix that, using our own Q&A loop as training data."
draft: false
---

There's a linguistic hypothesis called Sapir-Whorf: the language you speak shapes what you can think. The vocabulary available to you constrains the thoughts you can form. Deprive a speaker of a word, and you've made certain distinctions harder to draw.

It applies directly to LLM context compression.

When Kompress compresses a tool output and removes the token `SIGILL`, the agent reading that output literally cannot reason about `SIGILL`. It doesn't know what crashed. It pattern-matches from context, guesses, and often gets it wrong. The "tool looks mangled" problem in [headroom issue #1307](https://github.com/headroomlabs-ai/headroom/issues/1307) is exactly this: lossy compression creating a linguistically impoverished environment for the agent.

The current Kompress v2 was trained on generic text to maximize compression ratio. That's the wrong objective. The right objective is: **preserve the minimal vocabulary the agent needs to continue reasoning correctly, discard everything else.**

This post walks through fine-tuning it with that objective.

---

## What Kompress actually does

Kompress is a dual-head ModernBERT model. For each input token it outputs a score [0,1]. Tokens scoring above 0.5 are kept; everything else is dropped.

The two heads:
- **Token classifier**: linear(768, 2) — binary keep/discard
- **Span CNN**: 1D conv that boosts "borderline" tokens in semantically important spans

The final score: `token_prob * (0.5 + 0.5 * span_score)`

Architecture diagram:
```
input tokens
    ↓
ModernBERT (22 layers, 768-dim)
    ↓
last_hidden_state [B, L, 768]
    ├── token_head [B, L, 2] → softmax → token_prob [B, L]
    └── span_conv → span_score [B, L]
         ↓
final_score = token_prob × (0.5 + 0.5 × span_score)
tokens where final_score > 0.5 → kept
```

The problem is the training data. `dataset_v2` (n=500) was hand-labeled tool outputs. It doesn't know what matters in an **agent loop** specifically — where an agent reads tool results to verify facts and make decisions.

---

## The training data insight

[Ultrawhale](https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood) generates Q&A pairs with two responses:
- `deepseek_response`: verbose, 200-400 tokens
- `free_response`: compressed, 50-100 tokens, semantically equivalent

This is exactly what we need. The free model already compressed the information. We can use it as silver-standard compression labels.

**Silver label rule**: token in `deepseek_response` gets label=1 (keep) if the word appears in `free_response`. Override to label=1 for numbers, paths, identifiers, flags — the "linguistically essential" tokens that a Sapir-Whorf analysis tells you cannot be dropped without losing the concept.

```python
def silver_labels(token_strings, reference_words):
    for tok in token_strings:
        is_must_keep = is_number(tok) or is_identifier(tok) or is_path(tok)
        in_reference = tok.lower() in reference_words
        label = 1 if (is_must_keep or in_reference) else 0
        weight = 3.0 if is_must_keep else 1.0
```

~2000 training pairs from ultrawhale. Not a lot. But ModernBERT already knows language — we're only adjusting the heads' prior on what's "important".

---

## LoRA fine-tune: only touch what matters

We freeze the encoder (it already understands language). LoRA r=16 on the last 4 attention layers + re-train both heads. Total trainable parameters: ~2M out of 140M.

```python
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["query", "key", "value"],
    layers_to_transform=list(range(18, 22)),  # last 4 of 22 layers
)
```

**Why last 4 layers?** Higher layers encode more task-specific representations. The encoder's lower layers (syntactic structure, basic semantics) are already correct. We want to shift what "important" means at the semantic level, not rewire basic language understanding.

**Loss function**:
```python
loss = weighted_BCE(token_logits, labels) * must_keep_weight
     + 0.3 * BCE(span_scores, token_keep_mask)
```

The `must_keep_weight` of 3.0 for numbers/identifiers is the Sapir-Whorf term: don't drop the words that are irreplaceable.

---

## Training on vast.ai ($0.18 total)

RTX 4090 at $0.356/hr. Training time: ~15 minutes. Total cost: $0.09.

```bash
# Rent the instance
vastai create instance 37031007 \
    --image pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime \
    --disk 30 \
    --onstart "bash /workspace/ultrawhale/scripts/vast_setup.sh && \
               bash /workspace/ultrawhale/scripts/run_training.sh"
```

The run:
1. Export ultrawhale data (~3 min, downloads 3 JSONL files)
2. Fine-tune 3 epochs (~12 min on 4090)
3. Eval on held-out 10% (~1 min)
4. Export ONNX — same format headroom expects
5. Upload to HuggingFace

---

## Evaluation: task metrics, not F1

Current v2 metrics: F1=0.913, keep_rate=0.810.

We're targeting: `keep_rate < 0.75` at `exact_keep_pct > 0.95`.

That means: compress more aggressively (25% token reduction vs current 19%) while keeping every number, path, and identifier intact. The Sapir-Whorf criterion: the agent's conceptual vocabulary is preserved.

Secondary metric: does the agent still complete tasks correctly after compression? This requires running headroom's `agent-evals/` suite — planned for v3.1.

---

## Additional datasets (planned for v3.1)

The ultrawhale pairs are conversation-style. Real headroom traffic is different:
- **OpenOrca** — GPT-3.5 vs GPT-4 responses to same question (verbosity contrast)
- **WikiSum** — full Wikipedia article vs abstract (extreme length ratio)
- **ShareGPT** — multi-turn conversations, consecutive clarifications
- **CodeSearchNet** — code + docstring pairs (code compression domain)
- **BillSum** — legal text → summary (high-density technical language)

Each adds a different domain. The compression-relevant property in all: two versions of the same information at different lengths. The fine-tune needs diversity here — overfit on ultrawhale and the model will only know how to compress philosophical Q&A.

---

## The Jupyter notebook

Run the full pipeline in Google Colab (free T4, ~45 min) or locally:

👉 **[Open in Colab](https://colab.research.google.com/github/peterlodri-sec/ultrawhale/blob/main/notebooks/kompress_finetune.ipynb)**

The notebook walks through every step: data export, labeling, training, ONNX export, and a live demo compressing real headroom traffic.

---

## Why this matters

Headroom saved $171 on prefix cache in one session. Kompress is why. Every token it correctly removes is a token that doesn't need to be processed by the upstream API.

But the current model drops tokens that matter. A fine-tuned model that keeps the linguistically essential tokens — the ones the agent needs to form correct thoughts — while being more aggressive on filler, is the right tradeoff.

The Sapir-Whorf frame is genuinely useful here: think about what words the agent CANNOT lose without losing the concept, and make sure those survive. The rest is safely compressible.

Code: [ultrawhale/scripts/](https://github.com/peterlodri-sec/ultrawhale/tree/main/scripts)
Dataset: [PeetPedro/ultrawhale-dogfood](https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood)
Base model: [chopratejas/kompress-v2-base](https://huggingface.co/chopratejas/kompress-v2-base)

*Related: [Compressing the loop](/posts/2026-06-24-compressing-the-loop) · [M3 dogfeed headroom](/posts/2026-06-24-m3-dogfeed-headroom) · [Loop Radio](/posts/2026-06-24-loop-radio)*
