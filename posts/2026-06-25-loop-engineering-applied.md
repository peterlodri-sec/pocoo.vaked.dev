---
title: "Loop engineering applied: Osmani + Anthropic patterns mapped to a compression fine-tuning problem"
date: 2026-06-25
tags: [loops, ml, kompress, headroom, agent-engineering, evaluator-optimizer, voting-ensemble, build-in-public]
description: "Addy Osmani's five loop building blocks and Anthropic's agent patterns applied to a real problem: teaching a compression model to preserve must-keep tokens. Which patterns we used without knowing it, which we missed, and what we built when we deliberately applied them."
draft: false
---

We spent today fine-tuning [Kompress](https://huggingface.co/chopratejas/kompress-v2-base) — a ModernBERT token compression model — and ended up building a self-improvement loop without explicitly designing it as one. Reading Addy Osmani's [Loop Engineering](https://addyosmani.com/blog/loop-engineering/) and Anthropic's [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents) after the fact, almost every technique maps to something we did or should have done.

This post maps the patterns explicitly, notes what we missed, and what we built when we applied them deliberately.

---

## What we built without knowing the names

**Evaluator-optimizer (Anthropic pattern):** One model generates compressions. A second model — `eval_heretic.py` — evaluates them on adversarial prompts dense with must-keep tokens. The loop runs until the evaluator's output satisfies the convergence criterion (override_delta = 0, heretic exact_pct > 0.96). We ran this across five model versions.

**State file (Osmani primitive):** `LOOP_STATE.md` — the spine of the loop. Tracks every model version, its mk_in_ref, heretic exact_pct, override delta, and remaining budget. Tomorrow's run reads this instead of reconstructing context from git history.

**Skills (Osmani primitive):** `.agents/skills/kompress-finetune/SKILL.md` — the training pipeline encoded once. Decision rules, convergence criteria, benchmark instructions, the correctable loop invariant. Every future run that touches this problem reads the skill instead of re-deriving from scratch.

**Sub-agents: maker/checker (Osmani primitive):** `train_kompress.py` is the maker. `eval_heretic.py` is the checker. We ran them sequentially but they're logically separate — the checker has no exposure to the maker's reasoning, which is exactly why the checker catches what the maker misses. The maker that trained on ultrawhale labels couldn't see that the labels were wrong. The checker (heretic eval) immediately showed the Q&A test set was measuring the wrong thing.

---

## What we missed, applied deliberately

### Parallelization → voting ensemble

Anthropic's parallelization pattern, voting variant: run the same task multiple times with different models, take the majority. Applied to token compression:

```python
# v3, v4, v5 each vote on every token
# Keep token if >= 2/3 models vote keep, OR override fires
votes = torch.zeros(seq_len)
for model in [v3, v4, v5]:
    scores = model.get_scores(input_ids, attention_mask)
    votes += (scores > 0.5).float()
keep = votes >= 2  # majority
```

The ensemble is more robust than any single model:
- v3 knows the Q&A compression distribution
- v4 knows the self-labeled distribution (better must-keep preservation)
- v5 is v4 with one more iteration (slightly worse but different failure modes)

A token that all three vote to drop is safely droppable. A token that even one votes to keep gets a second look from the override.

*Results running now.*

### Evaluator-optimizer → iterative self-labeling

We ran self-labeling as a one-shot process: compress all texts with v3+override, retrain. The evaluator-optimizer pattern says: loop until the evaluator is satisfied.

Applied to self-labeling:

```python
# Evaluator: check mk_in_ref on a sample after each labeling pass
# If mk_in_ref < 0.9, identify which examples failed and retry
# Stop when mk_in_ref converges or budget exhausted

while mk_in_ref < 0.90 and budget_remaining > 0:
    new_refs = compress_with_override(training_texts, current_model)
    mk_in_ref = measure_mk_in_ref(new_refs)
    if mk_in_ref < threshold:
        # Re-label only the failed examples with stronger override
        failed = [i for i, r in enumerate(new_refs) if mk_in_ref_per_example[i] < 0.8]
        new_refs[failed] = force_label_must_keep(training_texts[failed])
    current_model = train(new_refs)
```

We didn't do this — we ran one pass and accepted 0.823. The evaluator-optimizer loop might have gotten us to 0.90+ without another training run.

### Routing → domain-aware compression

Anthropic's routing pattern: classify input → specialized handler.

Applied to kompress inference:

```python
domain = classify_domain(text)  # code/log/json/prose/other
threshold = DOMAIN_THRESHOLDS[domain]  # different per domain
keep = scores > threshold
```

Code diffs: lower threshold (0.35) — preserve more, technical tokens matter.
Log streams: medium threshold (0.45) — keep ERROR/WARN, drop INFO noise.
Prose: higher threshold (0.55) — compress aggressively, meaning survives.

No retraining needed. One regex-based domain classifier + threshold table. This is the cheapest possible improvement to production kompress behavior.

### Orchestrator-workers → parallel self-labeling at scale

For v4 we self-labeled 1802 texts sequentially on one GPU. The orchestrator-workers pattern would:
- Orchestrator: splits texts by domain, assigns to workers
- Workers: one per domain, each with domain-specific compression parameters
- Synthesizer: merges results, checks mk_in_ref per domain

Code texts would be labeled with lower threshold (keep more). Prose texts with higher threshold. The merged dataset would have better per-domain mk_in_ref than the global approach.

---

## The correctable loop invariant applied

From [The Correctable Loop](/posts/2026-06-24-the-correctable-loop): if the loop cannot be shifted by clear evidence within three iterations, stop it.

We applied this to the self-labeling sequence:
- v3 → v4: large jump (0.942 → 0.967, override became redundant) — keep going
- v4 → v5: slight regression (0.967 → 0.961) — **stop**

Two iterations. The loop didn't improve. We stopped and changed approach (voting ensemble, domain routing) rather than running v6, v7, v8 into diminishing returns.

This is the invariant applied correctly: stop when the metric stops moving, not when the budget runs out.

---

## What the state file enables

With `LOOP_STATE.md` and `.agents/skills/kompress-finetune/SKILL.md`, the next session that opens this problem knows:
- Convergence criterion (override_delta = 0, heretic > 0.96)
- Which benchmark to trust (heretic, not Q&A)
- Which experiments to skip (more self-labeling, larger models)
- Budget remaining ($5.90)
- Open hypotheses (voting ensemble, domain routing, C3 self-distillation)

The loop can resume without reconstructing from git history. This is Osmani's "the agent forgets, the repo doesn't" made concrete.

---

## The patterns that don't apply here

**Automations on a schedule:** our loop runs on-demand (after each experiment), not on a timer. The trigger is a new model version, not a clock. Scheduled automations make sense for production monitoring (headroom savings drift, model freshness) — not for research experiments.

**Worktrees:** we ran one experiment at a time, not in parallel. With $5.90 remaining, we could run two experiments simultaneously (domain routing + evaluator-optimizer self-labeling) in separate worktrees. The bottleneck is analysis time, not compute isolation.

**Connectors/MCP:** we don't have connectors to Linear, GitHub CI, or Slack wired into this loop. The PR #1400 was opened manually after training. A connector would auto-update the PR with each new eval result — worth wiring if this becomes a recurring pipeline.

---

## What to build next

**Immediate (free):**
- Voting ensemble results (running now)
- Domain routing threshold table (one eval pass, no training)

**With remaining $5.90:**
- Evaluator-optimizer self-labeling (loop until mk_in_ref >= 0.90, ~$0.30-0.50)
- C3 self-distillation from real headroom proxy traffic (requires logging mode in production)

**Architectural:**
- Wire kompress-v4 as the new default model in headroom (PR after #1400 merges)
- Domain routing as a headroom config option
- Voting ensemble as a `HEADROOM_KOMPRESS_ENSEMBLE=1` opt-in

---

*See also: [The silver label problem](/posts/2026-06-25-the-silver-label-problem) · [Iterative self-labeling](/posts/2026-06-25-iterative-self-labeling) · [We ran the loop](/posts/2026-06-25-we-ran-the-loop)*
