---
title: "Your first free infinite loop"
date: 2026-06-24
tags: [loops, tutorial, openrouter, fine-tuning, practical, notebook]
description: "Zero cost. One API key. A self-referencing loop that generates data, teaches itself, and produces a fine-tuning dataset for your local agent. End-to-end, start to finish."
draft: false
---

This is the end-to-end guide. Everything in one place: setup, code, data, practical application.

**Zero cost.** The only requirement is a free OpenRouter account (no credit card, no rate limits on free-tier models). Everything runs locally.

→ **[Download the notebook](https://github.com/peterlodri-sec/ultrawhale/blob/main/examples/free-infinite-loop.ipynb)** — run it in Jupyter, Google Colab, or VS Code. No installation beyond `pip install requests`.

---

## What you're building

A self-referencing feedback loop that:
1. Generates a question based on what it currently knows
2. Asks a free LLM for an answer
3. Stores the result
4. Uses that result to generate a better question next time
5. Repeats indefinitely

After N iterations, you have a dataset. That dataset can be used directly for fine-tuning a local model (Ollama, LM Studio, Unsloth) or as training signal for a domain-specific agent.

The loop doesn't need supervision. It doesn't need expensive models. It doesn't need a cluster. It needs a topic, a free API key, and time.

---

## Setup (5 minutes)

**1. Get a free OpenRouter key**

Go to [openrouter.ai](https://openrouter.ai) → Sign up (free, no credit card) → API Keys → Create key.

Free models include:
- `openai/gpt-oss-20b:free` — strong general model
- `liquid/lfm-2.5-1.2b-instruct:free` — fast, low latency
- `meta-llama/llama-3.2-3b-instruct:free` — good for structured output

Check [openrouter.ai/models?max_price=0](https://openrouter.ai/models?max_price=0) for the current free list.

**2. Install**

```bash
pip install requests
```

That's it. No framework, no heavy dependencies.

**3. Set your key**

```bash
export OPENROUTER_KEY="sk-or-v1-..."
```

---

## The minimal loop

```python
import os, json, time, requests, hashlib
from datetime import datetime, timezone
from pathlib import Path

OPENROUTER_KEY = os.environ["OPENROUTER_KEY"]
FREE_MODELS = [
    "openai/gpt-oss-20b:free",
    "liquid/lfm-2.5-1.2b-instruct:free",
]

def ask(prompt: str, model: str) -> str | None:
    """Call a free OpenRouter model. Returns None on failure."""
    try:
        r = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_KEY}",
                "HTTP-Referer": "https://your-loop",
                "Content-Type": "application/json",
            },
            json={
                "model": model,
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 512,
            },
            timeout=30,
        )
        r.raise_for_status()
        choices = r.json().get("choices")
        return choices[0]["message"]["content"].strip() if choices else None
    except Exception:
        return None

def run_loop(
    topic: str,
    output_file: str = "loop_output.jsonl",
    interval_seconds: int = 10,
    max_iterations: int | None = None,
):
    """Run the self-referencing loop."""
    out = Path(output_file)
    knowledge: list[str] = []
    model_idx = 0
    iteration = 0

    print(f"Loop starting — topic: {topic!r}")
    print(f"Output: {out}  |  Ctrl+C to stop\n")

    while max_iterations is None or iteration < max_iterations:
        model = FREE_MODELS[model_idx % len(FREE_MODELS)]
        model_idx += 1

        # Generate the next question from accumulated knowledge
        if knowledge:
            context = "\n".join(f"- {k[:120]}" for k in knowledge[-5:])
            prompt = (
                f"You are studying: {topic}\n\n"
                f"What you know so far:\n{context}\n\n"
                f"Ask one specific question that would deepen understanding "
                f"of {topic} based on what you already know. "
                f"Just the question, nothing else."
            )
        else:
            prompt = f"What is a good first question to deeply understand: {topic}?"

        question = ask(prompt, model)
        if not question:
            time.sleep(interval_seconds)
            continue

        # Answer the question
        answer = ask(question, FREE_MODELS[(model_idx) % len(FREE_MODELS)])
        if not answer:
            time.sleep(interval_seconds)
            continue

        # Store
        knowledge.append(f"Q: {question} A: {answer[:200]}")
        record = {
            "id": f"loop-{iteration:05d}",
            "question": question,
            "answer": answer,
            "model": model,
            "topic": topic,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "iteration": iteration,
        }
        with out.open("a") as f:
            f.write(json.dumps(record) + "\n")

        print(f"[{iteration:04d}] Q: {question[:60]!r}  ({len(answer.split())}w)")
        iteration += 1
        time.sleep(interval_seconds)

    print(f"\nDone. {iteration} records → {out}")
```

**Run it:**

```python
# Try this topic to generate headroom/compression training data:
run_loop(
    topic="techniques for compressing LLM context windows and tool outputs",
    output_file="compression_techniques.jsonl",
    interval_seconds=8,
    max_iterations=50,
)

# Or any topic you want to deeply understand:
# run_loop(topic="how neural field equations produce visual hallucinations", ...)
# run_loop(topic="Rust ownership model edge cases", ...)
# run_loop(topic="post-quantum cryptography in TLS 1.3", ...)
```

That's the whole loop. 50 iterations, 8 seconds each, ~7 minutes. Free. The compression topic will produce data useful for building a headroom-aware agent — a model that actually understands *why* certain content compresses differently.

---

## What the loop produces

After 50 iterations, `neural_fields.jsonl` contains 50 records:

```json
{"id": "loop-00001", "question": "How do Turing instabilities arise in Wilson-Cowan equations?",
 "answer": "Turing instabilities arise when a small perturbation to...",
 "model": "openai/gpt-oss-20b:free", "topic": "...", "timestamp": "...", "iteration": 1}
```

Each iteration's question was shaped by the previous answers. By iteration 30, the questions are significantly more specific than at iteration 1. The loop is learning — not by updating weights, but by accumulating context.

---

## Using the data: fine-tuning a local agent

The JSONL output is already in Q&A format. Convert it to the Alpaca fine-tuning format for use with Unsloth, LM Studio, or any GGUF-compatible trainer:

```python
import json
from pathlib import Path

def to_alpaca(input_file: str, output_file: str) -> int:
    """Convert loop JSONL to Alpaca fine-tuning format."""
    records = [json.loads(l) for l in Path(input_file).read_text().splitlines() if l.strip()]
    alpaca = [
        {
            "instruction": r["question"],
            "input": "",
            "output": r["answer"],
        }
        for r in records
        if len(r.get("answer", "").split()) >= 10  # filter short answers
    ]
    Path(output_file).write_text(json.dumps(alpaca, indent=2))
    return len(alpaca)

n = to_alpaca("neural_fields.jsonl", "neural_fields_alpaca.json")
print(f"Converted {n} records → neural_fields_alpaca.json")
```

**With Unsloth (local fine-tuning):**

```bash
pip install unsloth
```

```python
from unsloth import FastLanguageModel
import json

# Load your base model (Llama 3.2 3B works well, fits on 8GB VRAM)
model, tokenizer = FastLanguageModel.from_pretrained(
    "unsloth/Llama-3.2-3B-Instruct",
    max_seq_length=2048,
    load_in_4bit=True,
)

# Your loop data becomes the training set
dataset = json.loads(open("neural_fields_alpaca.json").read())
# → follow Unsloth's fine-tuning guide from here
```

After fine-tuning on your loop's output, you have a local model that knows your domain deeply — built entirely from free LLM calls and your own iteration time.

---

## The Jupyter notebook

10 cells, fully commented, ready to run in Colab or locally:

| Cell | What it does |
|---|---|
| 1. Setup | `pip install requests matplotlib` + Python 3.9-compatible imports |
| 2. API key | Reads from env, Colab Secrets, or prompts |
| 3. Verify models | Live-probes free models, builds working list automatically |
| 4. Config | Set your topic, output file, iteration count |
| 5. Core functions | `ask()`, `generate_question()`, `answer_question()` — tested independently |
| 6. Run loop | Resume-aware (picks up from existing JSONL), safe Ctrl+C at any point |
| 7. Inspect | Stats + first/last record preview |
| 8. Visualize | Question/answer length over iterations — rolling average, vaked dark theme |
| 9. Export | Alpaca AND ShareGPT format for maximum trainer compatibility |
| 10. Analyze | Asks the LLM to synthesize what the loop discovered |

→ **[Open in GitHub](https://github.com/peterlodri-sec/ultrawhale/blob/main/examples/free-infinite-loop.ipynb)**  
→ **[Open in Google Colab](https://colab.research.google.com/github/peterlodri-sec/ultrawhale/blob/main/examples/free-infinite-loop.ipynb)**

Key fixes in the notebook vs naive implementations:
- `from __future__ import annotations` for Python 3.9 compat
- 429 rate limit handled with automatic backoff (not a crash)
- Resume-aware: re-running Cell 6 continues from where you stopped — no duplicate records
- Both Alpaca and ShareGPT export — most trainers accept one or the other

---

## Genesis contract for this loop

Before you run your own loop, write down:

1. **What are you reducing?** (e.g., "gaps in my understanding of X")
2. **What makes an iteration valid?** (e.g., "the answer introduces at least one new concept")
3. **When do you stop?** (e.g., "when I can explain X to a non-expert in 5 minutes")
4. **What must never be sacrificed?** (e.g., "answers must be checkable — no unfounded claims")

See [the genesis contract, formally](/posts/2026-06-24-genesis-contract-formally.html) for the full treatment.

---

## Further reading

- [The loop is already here](/posts/2026-06-24-the-loop-is-already-here.html) — why this is new
- [Reduce till it's a loop](/posts/2026-06-24-reduce-till-its-a-loop.html) — the connection to staged computation
- [Compressing the loop](/posts/2026-06-24-compressing-the-loop.html) — making loops cheaper with Headroom
- [Slop is data](/posts/2026-06-24-slop-is-data.html) — why imperfect output is still useful
- OpenRouter free models: [openrouter.ai/models?max_price=0](https://openrouter.ai/models?max_price=0)
- Unsloth fine-tuning: [github.com/unslothai/unsloth](https://github.com/unslothai/unsloth)
- Ollama local models: [ollama.ai](https://ollama.ai)
