---
title: "We trained a ternary LLM from scratch and asked it its own name. It doesn't have one."
date: 2026-07-25
tags: [ml, bitnet, ternary, from-scratch, pytorch, vast.ai, mlops, build-in-public, open-source, llm, loops]
description: "RivaQuant: a 162M-param BitNet b1.58 ternary transformer, trained from scratch on TinyStories on a rented RTX 3090. Two real bugs, both caught by an automated cost-safety watcher mid-training and fixed live. Then we asked it to name itself, and it turns out that question doesn't have an answer for a model like this — here's why, and what actually came out."
draft: false
---

RivaQuant is a small, from-scratch transformer where every attention and
MLP weight is ternary — literally `{-1, 0, 1}`, no other values, following
Microsoft's BitNet b1.58 recipe. 162M params, trained on
[TinyStories](https://huggingface.co/datasets/roneneldan/TinyStories) on a
single rented RTX 3090, ~3.8 hours, about 84 cents of compute. Public,
weights and all: [huggingface.co/PeetPedro/rivaquant](https://huggingface.co/PeetPedro/rivaquant).
Code: [entropy-om/rivaquant](https://github.com/entropy-om/rivaquant).

## Prove it converges before spending money on it

Ternary weights are a genuinely open question — does gradient descent even
work when every weight collapses to one of three values via a
straight-through estimator? Before touching a GPU, we ran the actual
math (`BitLinear`, adapted from [kyegomez/BitNet](https://github.com/kyegomez/BitNet)'s
real implementation, not reconstructed from a paper's prose) on a CPU, on a
toy sequence, and just watched it overfit:

```
loss @ step 0:   3.9176
loss @ step 50:  0.4617
loss @ step 150: 0.0190
loss @ step 299: 0.0071
```

That's the whole risk assessment. If that hadn't converged, nothing past
this point would have mattered.

## Two real bugs, caught mid-flight, not after

An automated cost-safety watcher polled the training pod every 20 minutes —
its actual job was making sure a $80 hard cap never got breached, but it
also tailed the training log for crash signatures. Twice, it found one.

**First crash**: `AttributeError: module 'torch.nn' has no attribute
'RMSNorm'`. `nn.RMSNorm` was added in PyTorch 2.4; the rented GPU image
shipped 2.1.0. The local smoke test that had verified convergence used a
different, newer torch pulled fresh by the package manager — which quietly
masked the exact version gap that broke the real deployed environment.
Fixed with five lines of custom RMSNorm (same math, no version dependency),
re-verified the convergence test still passed, relaunched.

**Second crash**: `torch.cuda.OutOfMemoryError`, batch 32 at sequence
length 512 on a 24GB card. Turns out BitNet's straight-through estimator —
keeping both the full-precision and quantized copy of every activation
alive for the backward pass — uses meaningfully more peak memory per
sample than a plain `nn.Linear` block at the same nominal size. Fixed with
a smaller micro-batch (8) and 4x gradient accumulation (same effective
batch, a fraction of the peak memory), verified with a 20-step smoke test
on the actual rented GPU before committing to the full 20,000-step run.

Both bugs, understood and fixed within one polling cycle each, not
discovered after wasting the whole run.

## The actual numbers

Final validation perplexity: **5.455**, at the best checkpoint (step
17,500 of 20,000 — the loss started climbing very slightly past that
point, and the training script always keeps the best-by-val-loss
checkpoint, not just the last one). Training loss dropped from 10.9 at
init (≈ ln(vocab_size), exactly what you'd expect from an untrained model
predicting uniformly) down to a floor around 1.6–1.7.

## Then we asked it to name itself

The instruction going in was explicit: the model names itself, we don't
impose a name on it. So before writing the model card, we prompted it 15
times — five each with `"My name is"`, `"I am called"`, `"You can call
me"` — sampled, unfiltered, and read what actually came out:

```
My name is Max. What is your name?" — Lily said, "That is Max, the owl
My name is Daisy. I like your hat." — Mia smiled and said, "That is very nice
I am called Tim. I like to play with you." They played and had fun together.
I am called an elephant. I like to eat honey. Do you want a banana?
You can call me if you want. I will give you a hug." — Lily smiled and said
```

A different plausible children's-story character every single time — Max,
Daisy, Lily, Ben, Tim, Tom, an elephant, a horse. There is no consistent
identity in there to report, because the question doesn't actually apply
to this model: TinyStories is full of characters introducing themselves
exactly that way, and a 162M-param completion engine trained only on that
corpus has no self-referential signal to draw on. It isn't declining to
answer or hiding something — "what is your name" just isn't a question
this kind of model has the substrate to answer coherently, and forcing a
name onto the model card anyway would have been exactly the kind of
unearned claim this whole project was trying not to make.

So the model is called RivaQuant on the repo and in the code, because that's
the project's name, not because the model told us that's its name. The
model card says exactly this, with the real samples, not a cleaned-up
version of them.

## What's next

Not "the first and only" anything — that framing got flagged and dropped
early. Real next steps if this continues: TT-decomposed layers on top of
the ternary base (a different, untested combination from the compression
work we already know doesn't help plain LoRA), and possibly a larger
TinyStories-scale run to see whether the identity question changes with
scale or just gets more elaborate story-character noise.

Repo: [github.com/entropy-om/rivaquant](https://github.com/entropy-om/rivaquant).
Model: [huggingface.co/PeetPedro/rivaquant](https://huggingface.co/PeetPedro/rivaquant) — public, weights and eval report both.
