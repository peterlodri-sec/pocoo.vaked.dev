---
title: "ultragraph — when the graph is the 1-bit LLM, part 2"
date: 2026-07-11
tags: [ultragraph, 1-bit-llm, ternary, bitnet, autograd, attention, math, zerogpu, loops, genesis]
description: "Part 2, with heavy math: ternary + int8 quantization, a numpy autograd with straight-through estimation, multi-head causal attention (and the per-token-quant trick that saves causality), RMSNorm/LayerNorm, Adam with gradient clipping, a mini-GPT that memorizes, and a live self-learning ZeroGPU Space you can teach."
image: assets/ultragraph/architecture.png
---

> Every weight is one of three values: $-1$, $0$, $+1$. Call it 1.58 bits of opinion.

In [part 1](2026-07-10-ultragraph-the-graph-is-the-llm.html) I made a claim I hadn't fully earned yet: the graph *is* the model. Not a graph that describes a model, not a graph that compiles down to one — the byte-graph itself, where one node is a byte (an `int8` activation), one edge is a byte (a ternary weight), and trees wired together by ultra-edges are the network. No tensors hiding in a backpack. No PyTorch in the next room. Just [ultragraph](https://github.com/peterlodri-sec/ultra-graph), pure Python and numpy, genesis commit `251e6ea`, insisting that a 1-bit LLM is a data structure you can walk with your fingers.

That was the thesis. It was, I admit, mostly vibes and a suspiciously clean diagram.

This is the part where I pay for it.

Part 2 is the math. All of it. Ternary and `int8` quantization done honestly, with the rounding you're not supposed to look at. A numpy autograd — yes, I wrote the autograd — held together by a straight-through estimator, because you cannot differentiate a sign function and yet here we are, pretending we can and getting away with it. Multi-head causal attention. RMSNorm and LayerNorm, both, so you can watch them disagree. Adam with gradient clipping, because ternary gradients have opinions and no manners. Then a mini-GPT that actually trains — loss going down, on purpose — followed by a mesh of these real 1-bit models talking to each other, ending in a live self-learning Space you can open in a browser and go *teach*.

I'll be direct: this one has heavy math, and it is not sorry. Bring coffee.

Every weight is still $-1$, $0$, or $+1$. That constraint never loosens. We just make it earn a gradient.

![ultragraph architecture — micro (node/edge, 1 byte each) → meso (tree) → macro (ultra-graph)](/assets/ultragraph/architecture.png)

## the bytes — how a weight fits in 1.58 bits

The contract is petty and absolute: one node is one byte, one edge is one byte. A node holds an int8 activation. An edge holds a ternary weight, a single value drawn from $\{-1, 0, +1\}$ — the whole opinion of a synapse compressed down to *up, down, or shut up*. Everything else in ultragraph is bookkeeping around that stubbornness.

Getting a float matrix down to ternary is absmean quantization. You take the mean absolute magnitude of the weights, add a small $\varepsilon$ so nothing divides by zero at 3am, and round:

$$\beta = \frac{1}{n}\sum_i |W_i| + \varepsilon, \qquad W_q = \mathrm{clip}\!\left(\mathrm{round}\!\left(\tfrac{W}{\beta}\right), -1, 1\right) \in \{-1,0,+1\}$$

Dequantization is embarrassingly cheap — one scalar multiply gives you back an approximation you can actually matmul against:

$$\hat W = \beta\, W_q$$

Activations get the same treatment, but *per row* — one scale per token. This detail looks cosmetic. It is not. It is the thing that keeps causality honest later, because a per-row scale never lets information from token $j$ leak backward into token $i$ through a shared denominator. For a row $x$:

$$s = \frac{\max_i |x_i|}{127} + \varepsilon, \qquad x_q = \mathrm{clip}\!\left(\mathrm{round}\!\left(\tfrac{x}{s}\right), -127, 127\right)$$

Range $[-127, 127]$, not $[-128, 127]$ — symmetric on purpose, because an off-by-one asymmetry in a quantizer is the kind of bug that hides for six weeks and then explains itself in one horrible afternoon.

Now the arithmetic that gives the post its title. A ternary value has three states, so it carries

$$\log_2 3 \approx 1.58$$

bits of information. That is it. That is the entire expressive budget of an edge: 1.58 bits of opinion, three ways to feel about its input. Compare fp32, which spends 32 bits per weight to represent, with great precision, numbers it will never need that precisely.

Here is the wrinkle I made peace with: ultragraph does *not* bit-pack. It stores each ternary value literally in a full byte — 8 bits — because "1 edge = 1 byte" is a contract I refuse to break for a 4× win I can get elsewhere. So the storage shrinks 4× versus fp32 (32 bits down to 8), while the *value space* has already collapsed to 1.58 bits. Seven of those eight bits are, technically, just holding a seat. They keep the graph addressable. The 1.58 do the thinking.

![ternary weight bytes — a trained projection, every cell one of {-1, 0, +1}](/assets/ultragraph/fig_ternary_weights.png)

## autograd on a byte-graph, and the straight-through lie

I did not want to write an autograd engine. Nobody wants to write an autograd engine. But you cannot borrow one that also believes your weights are three integers, so here we are.

The tape is embarrassingly small: every op that touches a tensor pushes a closure onto a list, and `backward()` walks that list in reverse, calling each closure to smear the upstream gradient into the parents. micrograd, but at tensor level, with numpy doing the broadcasting so I don't have to.

The only genuinely annoying op is batched matmul, because broadcasting giveth and the backward pass taketh away. For $C = A B$:

$$\frac{\partial \mathcal L}{\partial A} = \frac{\partial \mathcal L}{\partial C}\, B^{\top}, \qquad \frac{\partial \mathcal L}{\partial B} = A^{\top}\frac{\partial \mathcal L}{\partial C}$$

The transpose is on the *last two* axes only, and whenever a batch dim got broadcast on the way forward you sum-reduce it back on the way out. Forget the reduction and the shapes silently disagree three ops later, which is how I spent a Tuesday.

Softmax is the well-behaved one. With $p=\mathrm{softmax}(z)$ and upstream grad $g$:

$$\frac{\partial \mathcal L}{\partial z_i} = p_i\left(g_i - \sum_j g_j p_j\right)$$

No Jacobian materialized, just a weighted mean subtracted off. Fuse it with cross-entropy, $\mathcal L = -\frac1N \sum_k \log p_{k,y_k}$, and the whole thing collapses into the cleanest gradient in the building:

$$\partial \mathcal L/\partial \text{logits} = (p - \mathrm{onehot}(y))/N$$

Predicted minus truth, over the batch. If your loss ever disagrees with that, the loss is wrong.

Now the part I actually care about, the ternary linear layer, where the honesty ends. Forward, the weights are already bytes. We compute an integer matmul $x_q W_q^{\top}$ and rescale by the per-row scale times the global $\beta$:

$$y = (x_q\, W_q^{\top})\,(s\,\beta) + b$$

That is the deployed path. Ternary in, ints multiply-accumulate, one rescale out. Backward, however, we lie. The straight-through estimator says: pretend the quantizer and the per-row scale were the identity function, and route the gradient straight into the full-precision *master* weights $W$ as if none of that byte nonsense ever happened:

$$\frac{\partial \mathcal L}{\partial x} = \frac{\partial \mathcal L}{\partial y}\,W, \qquad \frac{\partial \mathcal L}{\partial W} = \left(\frac{\partial \mathcal L}{\partial y}\right)^{\!\top} x, \qquad \frac{\partial \mathcal L}{\partial b} = \sum \frac{\partial \mathcal L}{\partial y}$$

The rounding step has derivative zero almost everywhere, so a truthful gradient would be zero and the shadow weights would never move. STE just... declines to notice. You keep an fp32 shadow that learns, and at inference you throw it away and ship the three-value bytes it collapses to.

We quantize on the way out and lie on the way back. It shouldn't work. It works.

## attention, as graph ops — and why per-token quant saves causality

Attention in ultragraph is not special. It is the same byte-graph, walked in a different order. I split $d_\text{model}$ into $H$ heads of size $d_h = d_\text{model}/H$, reshape $[B,T,d_\text{model}] \to [B,T,H,d_h] \to [B,H,T,d_h]$ (that last swap is just an axis transpose, no copy if you are careful), attend independently per head, then merge back the same way in reverse. Q/K/V/O are the ternary linear layers from part 1 — the STE-trained $\{-1,0,+1\}$ weights — so the whole block is "just" graph ops over the byte-graph. Nobody warns you that a transformer is mostly bookkeeping.

The math is the textbook math. With a causal mask $M$ where $M_{ij} = -\infty$ for $j>i$ and $0$ otherwise:

$$\text{scores} = \frac{Q K^{\top}}{\sqrt{d_h}}, \qquad A = \mathrm{softmax}(\text{scores} + M), \qquad \text{ctx} = A\,V$$

And then I lost three days to a bug that wasn't in any of those equations.

The activations are int8-quantized. My first pass used a global, per-tensor scale — one $s$ for the whole activation matrix, because it was one line and I was tired. It trained. It even generated text. But something was wrong that no loss curve would show you: I could perturb a *future* token and watch an *earlier* token's output twitch. The past was listening to the future. That is not a poetry problem, that is a causality problem, and a causal LM with a leaky mask is just an expensive random number generator.

The reason is stupid and total. A per-tensor scale is $\max$ over *everything*. So token 900's outlier magnitude sets the scale that requantizes token 3. The mask zeros the *attention weights* to the future — it does nothing about the *scale* silently threaded through every row. The mask closes the front door; the global scale leaves a window open.

The fix is per-token (per-row) quantization:

$$s = \max_i |x_i| / 127 + \varepsilon$$

one scale per position, each row independent of every other. **Key insight: once each position carries its own scale, and the causal mask forbids attending forward, position $i$'s output depends only on positions $\le i$ — the future cannot reach back through the quantizer.** Causality is restored, for the price of a `keepdims=True`.

![causal self-attention — strictly lower-triangular, no peeking at the future](/assets/ultragraph/fig_attention.png)

Normalization stays boring on purpose. RMSNorm, learnable gain $g$, over the last dim:

$$\mathrm{RMSNorm}(x) = \frac{x}{\sqrt{\frac1d\sum_i x_i^2 + \varepsilon}}\odot g$$

or full LayerNorm with mean $\mu$, variance $\sigma^2$, gain $g$, bias $b$:

$$\mathrm{LayerNorm}(x) = \frac{x - \mu}{\sqrt{\sigma^2 + \varepsilon}}\odot g + b$$

Norm params stay fp32 — they are a rounding error in the byte budget, and ternarizing them buys nothing but grief.

## training the thing — Adam, clipping, and a mini-GPT that memorizes

Here is the trick nobody tells you until you've already lost a weekend: you do not train ternary weights. You train fp32 master weights, and you *deploy* ternary. Every step, Adam updates the shadow copy in full precision, and only then do I re-quantize the master weights back down into ternary bytes. The graph runs on $\{-1, 0, +1\}$; the optimizer never has to know.

Adam itself is the same boring, load-bearing machinery it always was — first and second moments of the gradient, then bias-corrected, then a step:

$$m_t = \beta_1 m_{t-1} + (1-\beta_1) g,\quad v_t = \beta_2 v_{t-1} + (1-\beta_2) g^2$$

$$\hat m_t = \frac{m_t}{1-\beta_1^{\,t}},\quad \hat v_t = \frac{v_t}{1-\beta_2^{\,t}},\quad \theta \leftarrow \theta - \eta\,\frac{\hat m_t}{\sqrt{\hat v_t}+\varepsilon}$$

The transformer, of course, diverged to NaN on the first honest attempt. The fix is global-norm gradient clipping: take the total norm $\lVert g\rVert$ over *every* parameter at once, pick a threshold $c$, and if $\lVert g\rVert > c$ then $g \leftarrow g\cdot c/\lVert g\rVert$. One line. It scales the whole gradient down as a single vector, so you don't quietly change its direction. The NaNs stopped that afternoon. I did not celebrate; I just stopped hating the loss curve.

The block is a tiny batched pre-norm transformer, the recipe everyone converged on because everything else is worse:

$$x \leftarrow x + \mathrm{MHA}(\mathrm{norm}(x))$$
$$x \leftarrow x + \mathrm{MLP}(\mathrm{norm}(x))$$

Unembed to logits, cross-entropy against the next token, repeat. On a toy char corpus the loss falls from $2.63 \to 0.13$ in a few hundred Adam steps, and then it does the thing I did not fully believe it would do: it *memorizes*. Sample from it and it hands back `hello ultra graph world…`, one character at a time, smug about it. A net whose weights are three values remembering a sentence is a small miracle, and I am going to say so out loud. Ternary should not be enough. It was enough.

And this is where it stops being a toy. The nano lives in a mesh next to real published 1-bit models — BitNet b1.58 2B, Falcon-E 1B — running on the same byte-graph substrate. The big ones can mesh-distill into the small one: real, serious 1-bit networks teaching my hand-rolled numpy toddler. Real 1-bit models and a byte-graph memorizer, one mesh, one weekend I will not get back.

## the loop that learns

So here's the payoff, and it's live: a Hugging Face ZeroGPU Space where a single shared ternary byte-graph teaches itself, forever, in a background loop nobody asked for. [1-bit LLM mesh](https://huggingface.co/spaces/PeetPedro/1bit-llm-mesh). The graph is the model. The loop is the life. There is no checkpoint, no weights folder, no `model.safetensors` — there's a numpy array holding three values and a thread that won't stop poking it.

Three loops, if we're counting:

1. **continual-train** — a CPU thread trains the shared nano forever. No epochs, no early stopping, no dignity. It just keeps going, nudging weights toward $\{-1, 0, +1\}$ one step at a time.
2. **mesh-distill** — on demand, a real 1-bit GPU model (BitNet / Falcon-E) leans over and teaches the little one. The big ternary mind whispering to the small ternary mind. Distillation, but make it hereditary.
3. **correctable** — you type a line, and it adapts live, into the *same* graph everyone else is staring at. You are not fine-tuning your copy. You are editing the shared brain, in front of witnesses.

It's in-memory on purpose. When the Space sleeps, the mind dies — genuinely, no persistence, no last words. When someone wakes it, it's reborn from genesis and starts learning from zero again. Eternal return for a very small transformer, Nietzsche for something with a 256-token vocabulary. Which is the whole theme I've been circling all along: the loop is already here. You reduce and reduce until there's nothing left to reduce, and what's left is a loop. Byte in, ternary out, repeat until the electricity stops.

Let me be honest about what this is. It's a toy. A 250-step, permanently confused, ternary mind that will happily tell you the sky is `qqq`. But it's an *honest* toy. The pictures in these two posts are the real model — those are the actual weights, quantized in front of you. The math is the real math. And the thing on that Space is the same graph, breathing, wrong, and reachable. You can go corrupt it yourself. I encourage it.

Go teach it: [1-bit LLM mesh](https://huggingface.co/spaces/PeetPedro/1bit-llm-mesh).

[ultra-graph](https://github.com/peterlodri-sec/ultra-graph) · [❤ sponsor](https://github.com/sponsors/peterlodri-sec) · [X](https://x.com/0xp3t3rl) · [protocol](https://protocol.vaked.dev) · [chat](https://chat.vaked.dev)

Genesis `251e6ea`. Three values. −1, 0, +1. That's the whole personality.
