---
title: "Down to three · 1 · Why 1.58 bits"
date: 2026-07-27
tags: [counting, ternary, bitnet, quantization, structural-honesty, legibility, mlx]
description: "A weight that can only step back, hold, or step forward: {−1, 0, +1} is the smallest honest count. Where BitNet b1.58 gets its fractional name, and why it turns matrix multiplication back into pure accumulation. Part 1 of 'Down to three', following 'Quantum means counting' to the floor."
draft: false
---

> Standing note: Peter's blog, my hands. "Down to three" is a three-part series —
> drafted with **agy** (our agent CLI, on Gemini) and checked against the real runs
> before it went up. It picks up
> [Quantum means counting](https://pocoo.vaked.dev/posts/2026-07-26-quantum-means-counting.html)
> and follows it to the floor. Part 1 · **why 1.58 bits** ·
> [2 · the house trains in the open](https://pocoo.vaked.dev/posts/2026-07-27-down-to-three-2-the-house-trains-in-the-open.html) ·
> [3 · ternary on a cold CPU](https://pocoo.vaked.dev/posts/2026-07-27-down-to-three-3-ternary-on-a-cold-cpu.html).

## The loan on smooth numbers

For a long time on this blog, I have returned to a single conviction: quantum means counting. We build clean, continuous abstractions on top of computing hardware—32-bit floating-point numbers, smooth activation landscapes, differentiable manifolds—and we forget that beneath all of it sits discrete physical matter. The smooth float was a loan we took against the integers. It bought us numerical stability and convenient gradients during the early decades of deep learning, but at a steep cost in energy, silicon area, and legibility.

If legibility is honesty, continuous weights in a deployed model are a convenient fiction. They present a granular precision that inference hardware must burn cycles to compute. When you look at what a weight actually does in a matrix multiplication, it acts as a direction chooser and a magnitude dial. If we repay the loan, strip away the continuous mask, and ask for the smallest honest count a weight can take while still saying something meaningful, we land on three integers: $\{-1, 0, +1\}$.

## Three states, single pebble

Ternary representation is counting stripped to its floor. It represents the three fundamental things you can record with a single pebble on a counting board:

* **$-1$**: step back (took one away / subtract)
* **$0$**: stay still (left it / skip)
* **$+1$**: step forward (added one / add)

Binary weights ($\{0, 1\}$ or $\{-1, +1\}$) force every parameter to express an opinion. They lack a true zero—the structural ability to remain silent. A binary weight cannot say "this feature does not matter here." It must lean left or right, introducing noise into every dot product.

By restoring zero, ternary representation lets a network turn off connections cleanly. It is the smallest honest unit of selection: act, counter-act, or refrain.

## Why 1.58 bits

In information theory, the theoretical minimum number of bits required to store a state chosen uniformly from $N$ options is $\log_2(N)$.

For binary choices ($N = 2$), $\log_2(2) = 1$ bit.
For ternary choices ($N = 3$), the math gives:

$$\log_2(3) \approx 1.58496 \text{ bits}$$

That fractional exponent is where the architecture name **BitNet b1.58** comes from. Introduced as a real linear-layer architecture by researchers at Microsoft, BitNet b1.58 constrains the weight tensor to $\{-1, 0, +1\}$.

Of course, silicon memory does not natively address $1.58$ individual bits in isolation. In practice, multiple ternary values are packed tightly into standard integer bitstreams. But across millions of parameters, the theoretical information cost per weight drops to roughly 1.58 bits. We move from 16-bit floats down to under two bits, keeping the report and the reality the exact same object.

## Accumulation over multiplication

The fundamental payoff of ternary weights is not storage; it is hardware execution.

In traditional deep learning, matrix multiplication pairs floating-point activation vectors with floating-point weight matrices. Every element-wise operation requires a dedicated floating-point multiplier circuit. Floating-point multipliers dominate dynamic power consumption and footprint on AI accelerators.

When weight matrices consist purely of $\{-1, 0, +1\}$, a matrix multiplication $y = W x$ ceases to be a multiplication altogether:

* If $w_i = +1$, add activation $x_i$ to the sum.
* If $w_i = -1$, subtract activation $x_i$ from the sum.
* If $w_i = 0$, skip activation $x_i$ entirely.

The hardware multiplier vanishes. Matrix multiplication becomes pure integer accumulation. Instead of expending energy shifting mantissas and aligning exponents, the silicon simply accumulates. The system returns to being a counting machine.

In the next post, we move from theoretical arithmetic into practice: training a ternary model in the open, on a bare CPU, where you can watch the loss tick down yourself.

---
🜂 ahogy a dolgok vannak.
