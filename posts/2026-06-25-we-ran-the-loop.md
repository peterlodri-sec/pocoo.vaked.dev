---
title: "We ran the loop. Here's what the 14-step roadmap missed."
date: 2026-06-25
tags: [loops, kompress, headroom, vast.ai, fine-tuning, meta, agent-engineering, mlops, build-in-public, open-source, llm, claude-code]
description: "Lev's 14-step loop engineering roadmap is the best structural breakdown I've seen. We ran the loop today — five fine-tune runs, one merged PR, three blog posts, $0.55 compute. Here's what lived up to it and what it doesn't say."
draft: false
---

Lev Deviatkin's [14-step roadmap](https://www.linkedin.com/in/lev-deviatkin) is the most honest structural take on loop engineering I've read. The 4-condition test, the maker/checker split, the Ralph Wiggum failure mode — all real. All correct.

We ran the loop today. Not as a thought experiment. Actually ran it: five fine-tune iterations of a neural compression model, one PR opened and approved by a maintainer, three blog posts written from results, $0.55 spent on GPU compute. MacBook restarted mid-session and we recovered. The loop continued.

Here's what the roadmap gets right, what it doesn't say, and the one thing it avoids.

---

## What it gets exactly right

**The 4-condition test is the only honest gate.** Before we started today's runs, we had no automated eval. The model trained, we guessed it was better, we shipped it. That's a loop with no gate — the Ralph Wiggum pattern before we knew the name. We fixed it by writing `eval_kompress.py` and running it after every training pass. The loop immediately became useful: we could see that keep_rate was improving (0.810 → 0.713 across versions) while exact_keep_pct had plateaued (0.882 ceiling across v3, v3.1, v3.2, v3.3 despite very different training approaches). Without the eval, we would have kept optimizing the wrong thing.

**The maker/checker split isn't just for code review.** We used it for training data quality. The model that compressed text was not the model that judged whether the compression was correct — we used heretic-style adversarial prompts as an external checker. The model scored 0.942 on technical content. The checker (our eval script) told us the Q&A test set was measuring the wrong thing. That's exactly the pattern: maker generates, checker critiques with a different lens.

**State files are the spine.** We lost a full session to a MacBook restart. Everything we recovered came from git history — commits with meaningful messages, data files committed to the repo, scripts that documented their own parameters. The loop resumed because the state survived. The loop that lost was the one held only in the session context.

---

## The outer loop: Zach Lloyd's observer pattern

Zach Lloyd (@zachlloydtweets) published the clearest concrete implementation of this today — an "observer" Skill that grades an inner Skill, records failures, creates a diff to improve the Skill, and repeats. The observer runs the inner skill on N test cases, uses computer use to check the output for defects, synthesizes failure patterns, and opens a PR with improvements. The outer loop improves the Skill itself; the inner loop executes the task.

We built the same structure today without naming it that way:

- **Inner skill**: `train_kompress.py` — fine-tunes the compression model
- **Observer**: `eval_kompress.py` + `eval_heretic.py` — grades the model's output on two different test sets
- **Outer loop**: the sequence of v3 → v3.1 → v3.2 → v3.3 runs, each informed by the observer's report

Zach's observer creates diffs to improve the Skill. Ours created a different kind of diff: the insight that the Q&A eval was measuring the wrong thing, which led us to build the heretic eval and then to ship the hard override (PR #1400) instead of another training run.

The observer's exit criteria is built-in: "stop looping when the diffs become less meaningful." Ours: "stop when four consecutive training runs hit the same ceiling." Same invariant, different implementation.

---

## What it doesn't say

**The hardest part is knowing when the loop has found a real ceiling.**

We trained four versions of kompress (v3, v3.1, v3.2, v3.3) with different data mixes, different loss weights, different starting checkpoints. v3.3 reached loss=0.0007 — near-memorization. exact_keep_pct: 0.879. Same as v3 at 0.882.

The loop was working. The metric wasn't moving. These look identical from outside. The difference: the loop had found a real ceiling imposed by label noise in the training data, not by model capacity. No amount of training would escape it because the labels themselves encoded the wrong answer for 28% of the target tokens.

The roadmap says "the gate decides whether the loop helps or just spends." It doesn't say how to tell whether the gate is measuring the right thing. That's harder. We figured it out by building a second eval (the heretic adversarial test) that measured the thing we actually cared about — and immediately got different numbers (0.942 base, 0.969 with override).

**The loop has a meta-loop.** You're not just running one loop. You're running a loop about which loop to run. Today's sequence: train → eval → diagnose the eval → build a better eval → re-eval → find the actual fix (a deterministic override, not more training). Each of those was a loop iteration at a different level. The roadmap is about the inner loop. The outer loop — the one that changes what you measure — requires judgment the roadmap can't give you.

**The token budget is not abstract.** Lev mentions it: "loops re-read context and retry, that burns tokens." What this means in practice: we had $6.92 left on vast.ai. We allocated it across experiments deliberately — $0.18 for v3, $0.20 for v3.1, $0.20 for v3.2, $0.20 for v3.3, $0.35 for the heretic data generation run. Each experiment was sized to fit the remaining budget. That's not a budget cap on the loop — that's the loop itself being designed with resource awareness as a first-class constraint.

Most loop engineering writing treats tokens as infinitely available in principle and bounded in practice. The design changes when the bound is small and known in advance.

---

## The one thing the roadmap avoids

**The correctable loop invariant.**

Steps 12 and 13 (Ralph Wiggum failure, comprehension debt) describe what happens when loops fail. They don't describe the primitive that prevents it: **if a loop cannot be shifted by clear evidence within three iterations, stop it.**

Not slow it down. Not flag for review. Stop, inject something new, restart.

We hit this today. Four training runs, same ceiling. At that point, continuing to train is the Ralph Wiggum pattern: the loop is agreeing with itself, the metric is the wrong one, more iterations don't help. The correctable loop invariant says: three strikes, stop. We stopped. Built the override. Shipped the PR instead.

The reason the roadmap avoids this: it's uncomfortable. It says "sometimes the loop you designed is wrong and you should stop it before it completes." That's hard to put in a 14-step sequence that promises a roadmap from prompter to loop designer. But it's the invariant that separates loops that help from loops that just spend.

A loop that can be corrected is useful indefinitely. A loop that resists correction — that keeps training with noisy labels, that keeps writing the same wrong test, that keeps optimizing the wrong metric — is a liability from the moment it diverges from ground truth.

---

## The actual result

Today's loop:
- 5 GPU training runs: $0.55 total compute
- 1 PR merged in an open-source project (headroom #1400, approved by JerrettDavis)
- 3 blog posts written from experimental results
- 1 new eval benchmark (heretic adversarial test) that revealed the Q&A eval was measuring the wrong thing
- ~14 iterations destroyed and relaunched as we found bugs in the training pipeline

The loop worked because the gate was real (the eval), the state survived (git), and we stopped when the metric stopped moving (correctable loop invariant).

It failed three times before it worked: wrong Docker image, broken pip install, HuggingFace network unreachable. Each failure was diagnosable. Each one took under five minutes to fix and relaunch. That's what "the agent has senior engineer tools" means in practice — not power, just observability.

**The leverage moved. But so did the debugging surface.**

---

*Related: [The correctable loop](/posts/2026-06-24-the-correctable-loop) · [Compressing the loop](/posts/2026-06-24-compressing-the-loop) · [The silver label problem](/posts/2026-06-25-the-silver-label-problem)*

*External: [Zach Lloyd's observer pattern](https://x.com/zachlloydtweets/status/2069428152338665622) · [Lev's 14-step roadmap](https://www.linkedin.com/in/lev-deviatkin)*
