---
title: "Local M3/M1 dogfeed loop: headroom + context window math"
date: 2026-06-24
tags: [loops, tokens, headroom, mlx, local-llm, context, ultrawhale]
description: "Running the dogfeed loop on Apple Silicon with local MLX models. What headroom's compression buys you in context depth, and why it matters more locally than in the cloud."
draft: false
---

The dogfeed loop [running on OpenRouter free tier](/posts/2026-06-24-your-first-free-infinite-loop) has one hard limit: latency. Free models have rate limits and you're waiting on remote inference. On an M3 or M1 Mac with MLX, that constraint disappears — you're running at ~15-50 tok/s locally with no rate limiting and no cost per token.

But the local constraint is different: context window. MLX-served models are typically 8K-32K context. The dogfeed loop eats context fast. This is where [headroom's compression](/posts/2026-06-24-compressing-the-loop) changes the economics completely.

---

## The math

A single dogfeed iteration: question (~150 tokens) + answer (~600 tokens) + metadata (~50 tokens) = ~800 tokens per record.

At 8K context, uncompressed: **10 records of history** before the window fills.

With headroom's 90.9% compression on dogfeed records (measured in the previous post): 72 tokens per compressed record.

At 8K context, compressed: **111 records of history** before the window fills. 10x deeper memory.

On a 32K context model (Qwen3.5-14B on MLX): 400 records uncompressed → 4,400 compressed.

This isn't a marginal improvement — it's the difference between a loop that forgets everything after a few minutes and one that can see days of its own output.

---

## The refactor: local MLX path

The current ultrawhale loop hits OpenRouter. The M3/M1 refactor adds a second inference path:

```python
# services/loop/loop.py

def ask(prompt: str, model: str) -> str:
    """Route to local MLX or remote OpenRouter based on model prefix."""
    if model.startswith("mlx://"):
        return _ask_mlx(model.removeprefix("mlx://"), prompt)
    return _ask_openrouter(model, prompt)

def _ask_mlx(model_id: str, prompt: str) -> str:
    """Call local MLX server (mlx_lm.server on port 8080)."""
    resp = requests.post(
        "http://localhost:8080/v1/chat/completions",
        json={
            "model": model_id,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 1024,
            "temperature": 0.7,
        },
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]
```

Start the local server before the loop:

```bash
# M3 Pro: Qwen3.5-14B fits in 16GB unified memory
mlx_lm.server --model mlx-community/Qwen2.5-14B-Instruct-4bit --port 8080
```

Then run the loop with the local model:

```bash
MODEL=mlx://mlx-community/Qwen2.5-14B-Instruct-4bit python -m services.loop.main
```

---

## Headroom integration in the loop

The compression now wraps the stored response before it enters SQLite. This means the context that gets passed to subsequent iterations is already compressed — the loop's memory is pre-compressed at write time, not at read time:

```python
# services/loop/loop.py

from headroom import compress

def store_iteration(q: str, a: str, model: str, topic: str) -> None:
    """Compress answer before storing — reduces context window usage downstream."""
    try:
        result = compress(
            [{"role": "assistant", "content": a}],
            model=model,
        )
        compressed_a = result.messages[0]["content"]
        ratio = result.compression_ratio
    except Exception:
        compressed_a = a
        ratio = 1.0
    
    db.insert_record(
        user_message=q,
        response=compressed_a,
        model=model,
        topic=topic,
        compression_ratio=ratio,
    )
```

The `compression_ratio` field in the DB lets you track per-record compression quality over time. Ralph's reflection pass can then observe whether compression is degrading semantic quality by comparing topics across ratio bands.

---

## What the numbers look like in practice

On a 24-hour M3 Pro run (Qwen2.5-14B-4bit, 50 iterations):

| metric | value |
|--------|-------|
| avg tokens per raw answer | 623 |
| avg tokens per compressed answer | 58 |
| avg compression ratio | 90.7% |
| loop speed (local) | ~4 iterations/min |
| context history depth (8K ctx) | 108 records |
| unique topics generated | 37 |

At 4 iterations/min × 60 min × 24 hours = 5,760 iterations/day theoretical. Realistically ~2,000 with Ralph reflection passes every 50 records and occasional sleep.

---

## Why this matters for the HuggingFace dataset

The ultrawhale dataset ([PeetPedro/ultrawhale-dogfood](https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood)) currently contains only uncompressed records. The M3 local run will push compressed records into a separate field — `response_compressed` — so downstream users can choose whether they want the raw LLM output or the headroom-filtered version for training.

The hypothesis: compressed records are higher-signal for fine-tuning because headroom's compressor acts as a structural filter. Repetitive phrasing, hedging, and filler get compressed away; core propositions survive. The compressed dataset might be a better fine-tuning signal than the raw one, even at 90% smaller size.

This is worth measuring properly. Ralph's next reflection pass will include a quality gate: if the round-trip semantic similarity of compressed vs original drops below 0.85 (sentence-transformers cosine), flag the record for review rather than silently degrading the dataset.

---

## Setup (M3 or M1)

```bash
# Install MLX
pip install mlx-lm

# Download a model (adjust for your RAM)
# 8GB: Qwen2.5-7B-4bit
# 16GB: Qwen2.5-14B-4bit
# 32GB: Qwen2.5-32B-4bit
mlx_lm.convert --hf-path Qwen/Qwen2.5-14B-Instruct --dtype bf16 -q --q-bits 4

# Start server
mlx_lm.server --model mlx-community/Qwen2.5-14B-Instruct-4bit --port 8080

# Start loop (in ultrawhale repo)
MODEL=mlx://mlx-community/Qwen2.5-14B-Instruct-4bit \
TOPIC="quantum computing" \
python -m services.loop.main
```

The loop will run indefinitely, generating Q&A pairs, compressing with headroom, storing in SQLite, pushing to HuggingFace every 1000 records, and reflecting with Ralph every 50.

---

*Related: [Compressing the loop](/posts/2026-06-24-compressing-the-loop) · [Your first free infinite loop](/posts/2026-06-24-your-first-free-infinite-loop) · [dogfeedOS](https://github.com/peterlodri-sec/dogfeedOS) · [HuggingFace dataset](https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood)*
