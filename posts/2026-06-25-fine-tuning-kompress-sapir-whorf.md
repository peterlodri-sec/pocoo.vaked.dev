---
title: "Fine-tuning Kompress: the Sapir-Whorf case for better compression"
date: 2026-06-25
tags: [ml, fine-tuning, kompress, headroom, language, loops, pytorch]
description: "Language shapes thought. Bad compression builds a linguistically impoverished environment for your agent. Here's how we fine-tuned Kompress v2 to fix that, using our own Q&A loop as training data."
draft: false
---

There's a linguistic hypothesis called Sapir-Whorf: the language you speak shapes what you can think. The vocabulary available to you constrains the thoughts you can form. Deprive a speaker of a word, and you've made certain distinctions harder to draw.

Hopi has no grammatical tense. The Pirahã have no words for specific numbers beyond one and two. These aren't gaps in their intelligence — they're structural constraints on what's easy to think about in that language. The cognitive load of reasoning around a missing concept is higher; some thoughts simply don't get thought.

It applies directly to LLM context compression.

When Kompress compresses a tool output and removes the token `SIGILL`, the agent reading that output literally cannot reason about `SIGILL`. It doesn't know what crashed. It pattern-matches from context, guesses, and often gets it wrong. The "tool looks mangled" problem in [headroom issue #1307](https://github.com/headroomlabs-ai/headroom/issues/1307) is exactly this: lossy compression creating a linguistically impoverished environment for the agent.

The current Kompress v2 was trained on generic text to maximize compression ratio. That's the wrong objective. The right objective is: **preserve the minimal vocabulary the agent needs to continue reasoning correctly, discard everything else.**

This post walks through fine-tuning it with that objective.

---

## What Kompress actually does

Kompress is a dual-head ModernBERT model (~149M parameters). For each input token it outputs a score [0,1]. Tokens scoring above 0.5 are kept; everything else is dropped before the context is sent to the upstream LLM.

The two heads:
- **Token classifier**: `Linear(768, 2)` — binary keep/discard logits, softmax to probability
- **Span CNN**: 1D conv that boosts "borderline" tokens sitting in semantically important spans

```
input tokens
    ↓
ModernBERT (22 layers, 768-dim hidden)
    ↓
last_hidden_state [B, L, 768]
    ├── token_dropout → token_head Linear(768,2) → softmax → token_prob [B, L]
    └── span_conv (Conv1d 768→256→1, GELU, Sigmoid) → span_score [B, L]
                              ↓
final_score = token_prob × (0.5 + 0.5 × span_score)
tokens where final_score > 0.5 → kept
```

The span head exists because tokens don't carry meaning alone — a number means nothing without the label next to it. A lone `42` is noise. `timeout: 42s` is a fact the agent needs.

The problem is the training data. `dataset_v2` (n=500) was hand-labeled tool outputs with no notion of what an agent actually needs. It doesn't know that `SIGILL` is irreplaceable while "the process" is filler. It doesn't know that exit codes matter and adjectives don't.

---

## What bad compression does to an agent

Consider a tool output:

```
Process exited with SIGILL (illegal instruction) at address 0x7fff2038
in libsystem_kernel.dylib. Thread 0 raised EXC_BAD_INSTRUCTION.
Memory: 4.2GB RSS, 1.1GB dirty pages before crash.
```

With Kompress v2 at keep_rate=0.81, you might get:

```
Process exited at address in libsystem_kernel. Thread 0 raised
Memory: 4.2GB 1.1GB before crash.
```

`SIGILL` is gone. `EXC_BAD_INSTRUCTION` is gone. The agent sees a crash with a memory address and a vague exception name. It can't distinguish this from an OOM, a segfault, or a permissions error. It will try the wrong fix.

This is the Sapir-Whorf problem: we removed the word for the concept, and now the concept is harder to form. The agent's vocabulary was impoverished by the compressor.

The tokens that must survive: signal names, error codes, exit codes, memory addresses, file paths, function names, version strings, flags. These are the words that carry the concept. Everything else — articles, prepositions, generic verbs, filler adjectives — is compressible without information loss.

---

## The training data insight

[Ultrawhale](https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood) generates Q&A pairs with two responses:
- `deepseek_response`: verbose, 200-400 tokens
- `free_response`: compressed, 50-100 tokens, semantically equivalent

The free model already compressed the information down to what it needed to answer the question. We can use it as silver-standard compression labels — if a token's word appears in the compressed version, it probably mattered.

**Silver label rule**: a token in `deepseek_response` gets label=1 (keep) if its lowercase form appears in `free_response`. Override to label=1 for anything matching:

```python
_MUST_KEEP = re.compile(r"""
    \d+(\.\d+)?          # numbers: 42, 3.14, 0x7fff
  | [A-Z_]{2,}           # ALL_CAPS: SIGILL, HTTP, EOF
  | [a-z_]+\.[a-z_]+    # dotted.paths: libsystem_kernel.dylib
  | /[a-z/._-]{2,}      # unix paths: /usr/lib/python3
  | \.[a-z]{2,4}\b      # extensions: .py, .so, .json
  | --?[a-z][\w-]*      # flags: --verbose, -n
  | \b[A-Z][a-z]+[A-Z]\w*  # CamelCase: EXC_BAD_INSTRUCTION
""", re.VERBOSE)
```

These tokens get `weight=3.0` in the loss function — the Sapir-Whorf term. Don't drop the words that name the concept.

~2000 training pairs from ultrawhale. Not a lot. But ModernBERT already knows language — we're only adjusting the heads' prior on what "important" means for an agent context.

---

## LoRA fine-tune: only touch what matters

We freeze the encoder (it already understands language). LoRA r=16 on the last 4 attention layers, plus re-train both heads from scratch. Total trainable parameters: ~2M out of 149M.

```python
lora_config = LoraConfig(
    r=16,
    lora_alpha=32,
    target_modules=["query", "key", "value"],
    layers_to_transform=list(range(18, 22)),  # last 4 of 22 layers
)
```

**Why last 4 layers?** ModernBERT's lower layers encode syntactic structure and basic semantics — already correct. The higher layers encode task-specific representations: what's "salient" for the current task. That's what we're shifting. We want the model to learn that `SIGILL` is more salient than "the process", not to rewire its grammar.

**Loss function**:

```python
# token_logits: [B, L, 2], labels: [B, L] (0=drop, 1=keep)
# must_keep_mask: [B, L] (True for numbers/identifiers/paths)

# Weighted cross-entropy: 3x penalty for dropping must-keep tokens
weights = torch.where(must_keep_mask, torch.tensor(3.0), torch.tensor(1.0))
token_loss = F.cross_entropy(
    token_logits.view(-1, 2),
    labels.view(-1),
    reduction='none'
) * weights.view(-1)
token_loss = token_loss[labels.view(-1) != -100].mean()

# Span head: should agree with the token keep mask
span_loss = F.binary_cross_entropy(
    span_scores, keep_mask.float()
)

loss = token_loss + 0.3 * span_loss
```

The 3.0 weight means the model is penalized three times as hard for dropping a number or signal name as for dropping "the". Over 3 epochs, it learns the asymmetry.

---

## Training on vast.ai

RTX 4090 at ~$0.38/hr. Expected training time: ~15-30 minutes. Total cost target: under $0.25.

The `--onstart` flag in the vast.ai CLI takes a file path, not an inline command. Write the boot script first:

```bash
cat > /tmp/vast_onstart.sh << 'EOF'
#!/bin/bash
git clone --depth=1 https://github.com/peterlodri-sec/ultrawhale.git /workspace/ultrawhale
bash /workspace/ultrawhale/scripts/vast_setup.sh
bash /workspace/ultrawhale/scripts/run_training.sh
EOF

# Find an offer with good network (inet_up >= 1000 Mbps)
vastai search offers 'gpu_name=RTX_4090 num_gpus=1 disk_space>=30 inet_up>=1000' \
    --order dph_total --limit 5

# Launch
vastai create instance <OFFER_ID> \
    --image pytorch/pytorch:2.3.0-cuda12.1-cudnn8-runtime \
    --disk 30 \
    --env "-e HF_TOKEN=$HF_TOKEN -e HF_REPO=PeetPedro/kompress-v3" \
    --onstart /tmp/vast_onstart.sh
```

The run script orchestrates four stages:

```
=== 1/4 Export training data ===   # downloads ultrawhale JSONL from HuggingFace
=== 2/4 Fine-tune ===              # 3 epochs, LoRA r=16
=== 3/4 Eval ===                   # keep_rate / sem_sim / exact_keep_pct
=== 4/4 ONNX export + upload ===   # exports fp32 ONNX, pushes to HF Hub
```

One lesson from the first run: not all vast.ai instances have working outbound connections to HuggingFace. Filter by `inet_up>=1000` and if the first machine fails to reach hf.co, destroy it and pick another — they're $0.00 until the training actually starts.

---

## Evaluation: task metrics, not F1

Current v2 baseline: F1=0.913, keep_rate=0.810.

We're targeting `keep_rate < 0.75` at `exact_keep_pct > 0.95`.

The eval script measures three things:

```
keep_rate      fraction of input tokens kept (lower = more aggressive compression)
exact_keep_pct fraction of must-keep tokens (numbers, identifiers) that survive
sem_sim        cosine similarity between original and compressed embeddings (bge-small-en)
```

`exact_keep_pct` is the Sapir-Whorf metric: did the linguistically essential vocabulary survive? F1 against generic labels doesn't capture this — you can have high F1 and still systematically drop signal names.

**Results:**

| Metric | v2 baseline | v3 fine-tuned | delta |
|--------|-------------|---------------|-------|
| keep_rate | 0.810 | **0.728** | -10% |
| exact_keep_pct | — | **0.882** | — |
| training cost | — | **~$0.20** | — |

keep_rate dropped from 0.81 to 0.73 — 10% more aggressive compression. exact_keep_pct at 0.882 means 88% of must-keep tokens (numbers, identifiers, signal names, paths) survived. The 12% that didn't survive is the next target: push exact_keep_pct above 0.95 with the domain-tagged v3.1 datasets.

---

## Planned: domain-specific compression profiles

The ultrawhale pairs are conversation-style Q&A. Real headroom traffic is more varied. The v3.1 roadmap adds domain-tagged training so the model develops different compression intuitions per input type:

| Domain | Keep | Drop |
|--------|------|------|
| Code diffs | `+`/`-` lines, signatures, imports | unchanged context, whitespace |
| Log streams | ERROR/WARN, stack frames, unique events | repeated INFO, timestamps |
| JSON blobs | non-null leaf values, rare keys | null, empty arrays, schema boilerplate |
| File trees | non-standard paths, recent files | `.git/`, stdlib paths, permission columns |

Domain prefix tokens (`CODE:`, `LOG:`, `JSON:`) tell the model which compression dialect to apply. One model, five heads of intuition.

Additional datasets for v3.1:
- **OpenOrca** — GPT-3.5 vs GPT-4 responses (verbosity contrast at scale)
- **WikiSum** — full article vs abstract (extreme length ratio)
- **CodeSearchNet** — code + docstring pairs
- **BillSum** — legal text → summary (dense technical language)

---

## The dogfood loop

The cleanest training signal is headroom's own production traffic. Every time headroom compresses a tool output, it produces an (original, compressed) pair with implicit keep/drop labels. Run the proxy for a week on real work, collect the pairs, fine-tune on them. The model learns from actual usage patterns, not synthetic Q&A.

This is the C3 self-distillation loop: headroom teaches kompress to compress the way headroom actually compresses. The model converges toward the proxy's real decisions rather than approximating them from silver labels.

It requires running headroom in logging mode — planned for v3.1 once the v3 base model is stable.

---

## The Jupyter notebook

Run the full pipeline in Google Colab (free T4, ~45 min) or on your own GPU:

👉 **[Open in Colab](https://colab.research.google.com/github/peterlodri-sec/ultrawhale/blob/main/notebooks/kompress_finetune.ipynb)**

The notebook has two paths:

**Quick start (Colab T4):** loads a 500-sample subset, runs 1 epoch, shows you the keep/drop decisions on a live example. Enough to understand the pipeline and experiment with the loss weights.

**Production run (vast.ai / local 4090):** full dataset, 3 epochs, ONNX export, HuggingFace upload. The same `run_training.sh` the post describes, unwrapped step by step with commentary.

---

## Why this matters

Headroom [saved $171 on prefix cache in one session](/posts/2026-06-24-m3-dogfeed-headroom). Kompress is a core part of why — every token it removes is a token that doesn't consume cache, compute, or context window.

But dropping the wrong tokens is worse than no compression at all. An agent that can't name the error it's looking at will debug the wrong thing. It will hallucinate a fix for a problem it cannot properly describe because the word for the problem was removed.

The Sapir-Whorf frame makes the objective concrete: list the words the agent cannot lose without losing the concept, ensure those survive, compress everything else. The fine-tune is just encoding that priority into the model's weights.

Code: [ultrawhale/scripts/](https://github.com/peterlodri-sec/ultrawhale/tree/main/scripts)
Dataset: [PeetPedro/ultrawhale-dogfood](https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood)
Base model: [chopratejas/kompress-v2-base](https://huggingface.co/chopratejas/kompress-v2-base)
Fine-tuned: [PeetPedro/kompress-v3](https://huggingface.co/PeetPedro/kompress-v3) **

*Related: [Compressing the loop](/posts/2026-06-24-compressing-the-loop) · [M3 dogfeed headroom](/posts/2026-06-24-m3-dogfeed-headroom) · [Loop Radio](/posts/2026-06-24-loop-radio)*
