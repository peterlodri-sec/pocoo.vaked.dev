---
title: "ultragraph — when the graph is the 1-bit LLM"
date: 2026-07-10
tags: [ultragraph, 1-bit-llm, ternary, bitnet, autograd, python, uv, genesis]
description: "A pure-Python (+numpy) graph library where the byte-graph IS a 1-bit ternary LLM. One byte per node, one byte per edge, trees wired by ultra-edges, a dunder API, autograd with straight-through estimation, and a batched multi-head transformer — built end-to-end with caveman subagents in one session."
image: assets/ultragraph/og-ultragraph.png
---

I built a small thing today that I like a lot: **ultragraph**, a graph library where the graph *is* the model. Not a graph that describes a network — the graph, byte for byte, is a 1-bit (ternary) LLM you can train and run.

Repo: [github.com/peterlodri-sec/ultra-graph](https://github.com/peterlodri-sec/ultra-graph). Genesis commit `251e6ea`.

The constraint I started from was deliberately silly: **one byte per node, one byte per edge.** A node stores an `int8` activation. An edge stores a ternary weight in `{-1, 0, +1}`. That's it. Everything bigger than a byte — the full-precision master weights, the gradients, the optimizer state — lives in an ad-hoc side store and never touches the hot path. The byte buffers are the deployed model; the side store is just scaffolding for training.

## three levels

The hierarchy is the whole idea:

- **node / edge** — 1 byte each. The micro level.
- **tree** — a whole graph. One self-contained module: a linear layer, an attention block.
- **ultra-edge** (`===`) — a typed connection *between trees*. The set of trees plus their ultra-edges is the **ultra-graph** — the full model.

![the model as an ultra-graph](/assets/ultragraph/fig_architecture.png)

The API leans all the way into Python dunder methods, because that's the fun part. `>>` is overloaded by operand type: `node >> node` builds a micro-edge inside a tree; `tree >> tree` builds an ultra-edge between trees. Same "flows into" idea at both scales.

```python
ug = UltraGraph()
a = ug.add(Tree.dense(64, 128, "a"))
b = ug.add(Tree.dense(128, 32, "b", act="none"))
a >> b                 # ultra-edge, plain
a.wire(b, "residual")  # residual skip
```

## ternary, the BitNet way

Weights are ternary and activations are `int8`, BitNet b1.58 style. Forward quantizes; backward uses a **straight-through estimator** so gradients flow to the full-precision masters as if the quantization were the identity. The autograd is a little reverse-mode tape over numpy — `micrograd` energy, but the ops are tensor-level and everything is quantized.

Here's a real trained query-projection's weight matrix. Every cell is one byte, one of three values:

![ternary weight bytes](/assets/ultragraph/fig_ternary_weights.png)

## it does attention

The engine is general, so a transformer falls out of it. I added single-head, then **batched multi-head causal self-attention**, RMSNorm and LayerNorm, and Adam with gradient clipping. The attention needed a couple of new autograd ops — batched matmul, `swapaxes`, `reshape`, axis-mean, `sqrt`, division — but once those existed the block is just the usual `softmax(QKᵀ/√d) · V` with a causal mask.

The one subtlety worth flagging: I quantize activations **per token** (per row), not per tensor. With a global activation scale, perturbing a later token would shift the quantization of *earlier* tokens, and causality quietly breaks. Per-row scaling keeps each position independent. Here's the real attention matrix from a forward pass — strictly lower-triangular, which is exactly the point:

![causal self-attention weights](/assets/ultragraph/fig_attention.png)

A tiny batched transformer (embedding → pre-norm attention + residual → pre-norm MLP + residual → unembed) trains cleanly. On a toy char corpus it drops from loss **2.63 → 0.13** in a few hundred Adam steps and samples back `hello ultra graph world hello hello ultra graph`. It memorized. Good enough for a byte-graph.

## how it got built

This is the building-in-public bit. I ran it as a brainstorm → design → implement loop and did most of the fan-out work through **caveman subagents**: builders that emit one focused file at a time, reviewers that read the diff and report only real bugs. The reviewers earned their keep — they caught a genuine topological-order bug in the forward pass, a NaN-scale edge case in the quantizer, and a module-index misalignment in save/load. The correctness-critical numerical core I wrote by hand, because that's where subagents drift.

Everything is pure Python plus numpy, managed with `uv`, Python 3.14. **43 tests pass** (numeric-gradient checks on every op, a causality proof, save/load byte-exactness, and end-to-end training). Snyk came back clean.

- `just test` — full suite
- `just demo` / `uv run python examples/mini_gpt.py` — the transformer end-to-end
- `just viz` — render the graph as SVG or PNG

The figures in this post were generated from an actual trained model (`assets/make_figures.py`), not mocked up. That felt important: if the claim is that the graph is the model, the pictures should be the model too.

Genesis `251e6ea`. It's small, it's honest, and every weight is a single byte.
