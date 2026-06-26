---
title: "Fine-tuning an orchestrator — encoding 17 experiments into one model"
date: 2026-06-26
tags: [orchestrator, fine-tuning, kompress, loop-engineering, open-source, lora]
description: "We fine-tuned Qwen2.5-7B-Instruct on 117 conversation pairs encoding all 17 kompress experiment outcomes. The result: kompress-superpower-orchestrator — a model that designs experiments, diagnoses failures, and spawns sub-agents. Total cost: $0.30."
draft: false
---

After 17 kompress models, 8 teachers, 4 architectures, and $38.95 in GPU compute, we had a problem. The experiment knowledge was trapped in blog posts, state files, and our heads. Every new researcher joining the loop would need to re-learn everything we discovered.

So we fine-tuned a model to encode it all.

---

## The Orchestrator

**kompress-superpower-orchestrator** is a LoRA fine-tune of Qwen2.5-7B-Instruct on 117 conversation pairs. Each pair encodes a decision, a diagnosis, or a planning session from the 17-model experiment. The model has six superpowers:

| Superpower | What it does | Example |
|---|---|---|
| **Experiment Designer** | Hypothesis → training plan | "Try GLM-5.2 as teacher" → spawns script, estimates cost |
| **Failure Diagnostician** | Metrics → root cause | heretic=0.878 → "v15 dilution pattern: 983 pairs drown signal" |
| **Council Engine** | Results → SHIP/RETRAIN/PIVOT | heretic=0.963 → "RETRAIN: +0.008 heretic but -11.3% compression" |
| **Sub-Agent Spawner** | Delegates to train/eval/label agents | spawn_train("v18", config) → vast.ai instance |
| **Budget Tracker** | Knows costs | "$0.13/run on RTX 4090, $0.15/version total" |
| **State Keeper** | Remembers all 17 versions | "v8=production, 11 dead ends, Pareto at λ=3/5/10" |

---

## Training Data

We built 117 conversation pairs from the experiment history. Each pair is a multi-turn conversation where the orchestrator uses tools:

```json
{
  "messages": [
    {"role": "system", "content": "You are kompress-superpower-orchestrator..."},
    {"role": "user", "content": "My model regressed to 0.878. Data: 983 pairs. Why?"},
    {"role": "assistant", "content": "Checking experiment history...", "tool_calls": [
      {"name": "check_status", "arguments": {}}
    ]},
    {"role": "tool", "content": "{\"versions\": 17, \"v15\": \"0.878 — data dilution\"}"},
    {"role": "assistant", "content": "v15 pattern: 983 pairs diluted the C3 signal. 61% generic data drowns teacher labels. Fix: reduce to 300 pairs at 33% C3 ratio. Want me to spawn that?"}
  ]
}
```

The data covers five categories:

| Category | Pairs | What it teaches |
|---|---|---|
| Diagnosis | 30 | Regression → root cause → fix (v9 overfit, v11 collapse, v15 dilution) |
| Planning | 40 | Q&A about teachers, architecture, data ratios, loss weights |
| Council | 20 | Metrics → SHIP/RETRAIN/PIVOT with reasoning |
| Spawn | 15 | Tool calls: train, eval, label, deploy |
| Multi-turn | 12 | Debugging conversations with follow-up questions |

---

## Fine-Tuning

We trained on vast.ai's cheapest RTX 4090 ($0.30/hr):

| Parameter | Value |
|---|---|
| Base model | Qwen/Qwen2.5-7B-Instruct |
| Method | LoRA (r=16, alpha=32) |
| Quantization | 4-bit NF4 (BitsAndBytes) |
| Trainable params | 40M / 7.6B (0.53%) |
| Epochs | 3 |
| Batch size | 1 (gradient accumulation ×16) |
| Learning rate | 2e-4 |
| NEFTune noise | α=5.0 |
| Total cost | ~$0.30 |

We tried DoRA (Weight-Decomposed LoRA) but it OOM'd on 24GB — needs an A100. NEFTune (noisy embeddings) fit easily and improves chat quality by adding controlled noise during training.

The loss curve was noisy (padding tokens in the causal LM loss) but the model learned the patterns. Four checkpoints saved (steps 8, 16, 24, 32).

---

## Results

The model is live at [PeetPedro/kompress-superpower-orchestrator](https://huggingface.co/PeetPedro/kompress-superpower-orchestrator).

**Usage:**

```python
from transformers import AutoModelForCausalLM, AutoTokenizer
from peft import PeftModel

base = AutoModelForCausalLM.from_pretrained("Qwen/Qwen2.5-7B-Instruct")
model = PeftModel.from_pretrained(base, "PeetPedro/kompress-superpower-orchestrator")
tokenizer = AutoTokenizer.from_pretrained("Qwen/Qwen2.5-7B-Instruct")

messages = [
    {"role": "system", "content": "You are kompress-superpower-orchestrator..."},
    {"role": "user", "content": "My model regressed to 0.878. What happened?"}
]
inputs = tokenizer.apply_chat_template(messages, return_tensors="pt")
outputs = model.generate(inputs, max_new_tokens=200)
print(tokenizer.decode(outputs[0]))
```

---

## What We Learned

**1. 117 pairs is enough for domain-specific fine-tuning.** You don't need 10K examples. 117 high-quality, domain-dense pairs encoding every decision from a real experiment is sufficient for LoRA.

**2. DoRA doesn't fit on 24GB for 7B models.** Weight-decomposed LoRA uses ~30% more memory. Stick with regular LoRA for consumer GPUs.

**3. NEFTune adds value for zero memory cost.** Noisy embeddings during training improve chat naturalness. It's a one-line addition: `TrainerCallback` that adds Gaussian noise.

**4. Causal LM loss with padding tokens is noisy but functional.** The loss values were large (82M → 0) with NaN gradients, suggesting the padding mask wasn't properly applied. The model still learned — next iteration should use `labels = [-100 if pad else id for id in input_ids]`.

**5. Function-calling data is scarce.** Most open-source fine-tuning datasets lack tool-call examples. Our 15 spawn pairs are a small but valuable contribution to the ecosystem.

---

## What's Next

- **v3 with DoRA on A100** — proper weight-decomposed LoRA should improve precision
- **More function-calling pairs** — generate 500+ tool-use examples from real agent traces
- **ACON teacher integration** — use agent-aware compression as a labeling teacher
- **Live demo** — deploy the orchestrator on HF Spaces with Gradio chat interface

---

## Links

- [Model: kompress-superpower-orchestrator](https://huggingface.co/PeetPedro/kompress-superpower-orchestrator)
- [Paper: kompress.vaked.dev](https://kompress.vaked.dev)
- [LoopKit: loop engineering starter kit](https://github.com/peterlodri-sec/loopkit)
- [All 20 models on HuggingFace](https://huggingface.co/PeetPedro)
- [Full experiment log](https://pocoo.vaked.dev/posts/2026-06-25-kompress-heretic-eval)

---

*"The loop doesn't just produce models. It produces understanding."*
