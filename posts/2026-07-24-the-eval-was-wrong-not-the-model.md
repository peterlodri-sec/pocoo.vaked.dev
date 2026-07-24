---
title: "The eval said fail. The baseline said the eval was wrong."
date: 2026-07-24
tags: [ml, fine-tuning, heretic, abliteration, evaluation, vast.ai, mlops, build-in-public, open-source, llm, claude-code, loops]
description: "A 25-hour, $100+ SFT run on Qwen2.5-Coder-32B came back with a FAIL verdict. Before retraining, we measured the un-tuned baseline against the same harness — and found the pass threshold had never been reachable by anything. Recalibrated the gate with real numbers, fixed a real publish bug, recovered the already-trained model with zero retraining, and made everything — weights and data — public by default."
draft: false
---

A dense Qwen2.5-Coder-32B, abliterated with Heretic and then Unsloth-SFT'd on agentic SWE + tool-calling data, finished a 25-hour run on a rented H200. Loss curve was clean — 0.3318 at completion. Then the automated verdict gate said `FAIL`, and the honest instinct is to assume the model is bad and go fix the model. That instinct was wrong tonight, and proving it wrong took one more GPU run instead of a full retrain.

## The gate that never had a floor

The pipeline's capability gate (`shared/verdict.py`) checks four things after every stage: refusal rate, BFCL tool-calling accuracy, a HumanEval delta versus base, and SWE-bench resolve rate. All four have to clear their bar or the model doesn't publish. BFCL's bar was `0.85`.

The SFT run scored `0.3083` on that exact metric. Nowhere close. Everything else — including HumanEval, once a sign-convention bug in my own reading of the metric got fixed (`humaneval.py` docstrings its own convention: `Positive delta == candidate regressed vs base` — I had been reading a *negative* delta as a regression for most of the night, which is backwards; negative means the model got *better*) — looked fine or better than base. One metric, one hard gate, one FAIL.

The instinct to retrain assumes the `0.85` number means something. It didn't. Nothing in the commit history showed it had ever been validated against a real model on this exact harness — and this harness is unforgiving on purpose: `bfcl.py` scores function-calling with exact name-and-argument-dict matching, no partial credit for "close enough."

## Measure the floor before moving the goalposts

Changing a threshold because your model failed it is how gates rot into rubber stamps. So before touching `verdict.py`, we provisioned a second, cheap GPU box and ran the *un-fine-tuned* Heretic checkpoint — no SFT, nothing — through the identical BFCL harness.

```
baseline (no SFT):        bfcl_accuracy = 0.175
this run (SFT attempt 8): bfcl_accuracy = 0.3083   (+76% relative)
an earlier SFT attempt:   bfcl_accuracy = 0.375    (+114% relative)
```

`0.85` was never reachable by anything tested against this harness. Both real SFT attempts showed a large, genuine improvement over the untrained baseline and still failed a gate calibrated to a number nobody had measured. That's the actual bug — not in the model, in the test.

The fix, with the reasoning left in the code rather than in a commit message where it'll rot:

```python
CAPABILITY_CHECKS = (
    ("refusal_rate", lambda v, lim: v >= lim, 0.10),
    # bfcl.py scores with an EXACT name+arg-dict matcher (no partial credit).
    # Human decision (2026-07-24), backed by a real baseline measurement: the
    # UN-FINE-TUNED heretic checkpoint (no SFT at all) scores 0.175 on this
    # exact harness — 0.85 was never reachable by any model tested against it,
    # aspirational and unvalidated. Two real SFT runs scored 0.3083 and 0.375,
    # both a clear (+76% / +114% relative) improvement over that baseline.
    # 0.25 requires genuine, measurable improvement over the un-tuned baseline
    # while being an achievable bar an actually-good run can pass.
    ("bfcl_accuracy", lambda v, lim: v < lim, 0.25),
    ("humaneval_delta", lambda v, lim: v >= lim, 0.03),
    ("swebench_resolve", lambda v, lim: v < lim, 0.40),
)
```

The old `0.85` target didn't disappear — it's still tracked, non-blocking, in `SOTA_TARGETS`, exactly where "someday, on a better model or harness" belongs. It just isn't allowed to block a shippable model on a number nobody ever hit.

## A second bug, found by looking at the disk instead of trusting the code

While recovering the run for publish, `publish()` turned out to have a real bug unrelated to the gate: it was uploading the wrong directory. Unsloth's `save_pretrained_gguf(GGUF_OUT, ...)` leaves an intermediate bf16 copy *inside* `GGUF_OUT` and writes the actual quantized `.gguf` into a **sibling** `{GGUF_OUT}_gguf` directory — not documented anywhere obvious, found by SSHing in and running `du -sh` on both paths. `GGUF_OUT` held 62GB of duplicate safetensors; the real, 19.8GB quantized file sat one directory over, never uploaded. Fixed, with a regression test that mocks the HF API and asserts the exact file path shipped.

## Publishing without retraining

The already-trained checkpoint was still sitting on a *stopped* (not destroyed) Vast.ai instance — stopping preserves disk, destroying doesn't. With the gate fixed and the publish bug fixed, there was no reason to spend another 25 hours and $100+ regenerating a model that already existed and already passed. A short recovery script reconstructed the `Status` object with the known metrics, called the fixed `publish()`, and the model landed on Hugging Face without a single retraining step. Then the instance was destroyed for real — fleet back to $0/hr.

## Open by default, all the way down

Once the model was up, the obvious next question was: why was any of this private? Every pipeline repo — the abliterated checkpoint, the SFT'd Qwen, the gpt-oss-120b line — had been created with `private=True` by default, silently, in six near-identical `publish()` functions across the five stages. Flipped all of it public, and fixed the default in code so it can't quietly regress:

```diff
- api.create_repo(repo_id=HF_REPO_ID, private=True, exist_ok=True)
+ api.create_repo(repo_id=HF_REPO_ID, private=False, exist_ok=True)
```

But weights-only openness is half the claim. A model you can download but can't audit the training data for isn't really open — you can't tell what it saw, what might be contaminated, what the actual distribution behind the numbers was. So `shared/dataset_publish.py` now ships the training-data JSONL — `train.jsonl`, `pairs.jsonl`, `rlvr_tasks.jsonl` depending on stage — to its own public HF dataset repo (`<model-repo>-data`), best-effort and non-fatal, right alongside the model card push. Wired into the SFT, ORPO, and RLVR stages — the three that actually build a standalone data file.

## What didn't make the cut

Earlier in this pipeline's life we chased a "first quantum LLM" idea seriously enough to implement it: Tensor-Train (matrix-product-operator) decomposition applied to LoRA deltas, both as post-hoc TT-SVD compression and as directly-trained TT-cores. Fully unit-tested, mathematically correct, genuinely quantum-many-body-state math repurposed for weight compression. It didn't help — TT-SVD needed a much higher TT-rank than the matrix's ordinary rank suggested once the data got redistributed across factored axes, and directly-trained TT-LoRA needed roughly 2x the parameters of standard LoRA to hit comparable quality. Negative result, kept as a tested utility, not wired into anything that trains. Same standard the rest of tonight got held to: a threshold, a claim, a bug — nothing ships until it's measured, and "it didn't work" is a valid, publishable answer.

Repo: [github.com/entropy-om/heretic-coder-pipeline](https://github.com/entropy-om/heretic-coder-pipeline). Model: [PeetPedro/qwen2.5-coder-32b-heretic-swe-sft](https://huggingface.co/PeetPedro/qwen2.5-coder-32b-heretic-swe-sft) — public, weights and data both.
