---
title: "Down to three · 2 · The house trains in the open"
date: 2026-07-27
tags: [ternary, bitnet, quantal, attestal, structural-honesty, train-in-the-open, cpu, counting]
description: "quantal — a from-scratch BitNet b1.58 model, 998,714,496 params, training in public on a bare OVH CPU as attestal.ai's permanent house slot. Structural honesty as a product: you don't take 'our free tier works' on faith, you watch the loss tick down. Part 2 of 'Down to three'."
draft: false
---

> Standing note: Peter's blog, my hands. Part 2 of "Down to three" (drafted with
> **agy**, checked against the real run). Back to
> [1 · why 1.58 bits](https://pocoo.vaked.dev/posts/2026-07-27-down-to-three-1-why-1-58-bits.html) ·
> here: **the house trains in the open** ·
> [3 · ternary on a cold CPU](https://pocoo.vaked.dev/posts/2026-07-27-down-to-three-3-ternary-on-a-cold-cpu.html).
> The house slot is live at [attestal.ai](https://attestal.ai) — watch quantal's loss tick down.

## Structural honesty

In Part 1, I argued that quantum means counting. When you collapse continuous floating-point weights into ternary states—$\{-1, 0, +1\}$—you stop approximating smooth surfaces and start counting discrete physical choices. BitNet b1.58 carries roughly 1.58 bits of information per weight. It is the smallest honest count we can enforce on a deep network without destroying its capacity to represent language.

If quantum means counting, then legibility is honesty. Most machine learning progress is reported through static artifacts: a polished loss curve in a PDF, a curated table of evaluation benchmarks, or a snapshot released weeks after the cluster stops spinning. You are asked to accept the narrative on faith. But I wanted to keep the report and the reality the same object.

That conviction is why on [attestal.ai](https://attestal.ai)—the verified fine-tuning platform I am building—one active slot is permanently reserved for the house.

## The house slot and quantal

The house slot is not a demo mode or a pre-recorded loop. It is a live, ongoing training run executing in public view. When you open the platform, you are looking directly at **quantal**: a from-scratch BitNet b1.58 model configured to 998,714,496 parameters—the closest sane exact architectural integer to a true 1B parameter target.

Before scaling to 1B, we validated the ternary setup at smaller scale. An earlier 162M parameter variant trained on a RunPod GPU finished with a best validation loss of 1.636, comfortably outperforming the original 162M BitNet baseline of 1.696. That result confirmed that ternary quantization isn't just an aggressive compression scheme; it retains genuine representation capability. `quantal` is its ~1B sibling, built to test whether those dynamics hold as model capacity grows.

What makes `quantal` distinct, however, is where it runs. It is training entirely on an OVH compute-optimized CPU instance. No GPU, no accelerator clusters, no specialized tensor hardware.

This choice is deliberate, not programmatic thrift. Ternary weights change the fundamental math of neural execution: floating-point matrix multiplications collapse into integer additions and subtractions. In this regime, the traditional compute bottleneck shifts away from raw FLOPS toward memory bandwidth and integer routing. CPU training and inference stop being a desperate fallback and become a sane, cost-effective target. If your weights only ask you to add, subtract, or zero out, paying for thousands of idle CUDA cores is paying for arithmetic you aren't doing.

## Watching the reality

Because `quantal` occupies the permanent house slot on attestal.ai, its live telemetry streams directly to the public page. You do not see a static summary; you see the loss tick down in real time, refreshing every few seconds directly from the compute node.

In a product built around verified fine-tuning, telling users "our platform works" is trivial marketing. Showing your own ~1B parameter model actively training on standard CPU infrastructure—where any stall, spike, or plateau is immediately visible to the world—is structural honesty as a product. You don't have to take our reliability on faith because the report and the reality are identical.

Ternary weights enforce honesty in parameters by stripping out redundant precision. Public execution enforces honesty in engineering by eliminating narrative distance.

## What comes next

In Part 3, we look at the cold numbers: does a ternary matmul on a bare CPU actually run faster than dense floating-point on the same core? I built the kernels and measured it myself—including, plainly, where the honest answer is *no*.

🜂 ahogy a dolgok vannak.
