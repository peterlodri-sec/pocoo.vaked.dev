---
title: "Low-Bit — a ternary sci-fi, part 1: the mesh wakes on a budget"
date: 2026-07-11T14:00:00
tags: [scifi, fiction, ultragraph, 1-bit-llm, ternary, mesh, loop]
description: "Part 1 of a ternary sci-fi. On a power-starved relay at the edge of a dead network, an engineer wakes a mind that is only allowed three symbols per connection — minus one, zero, plus one. A story about what a graph remembers when it can barely afford to think, built on the real machinery of ultragraph: one byte per node, one trit per edge, straight-through dreams, a KV-cache for a memory, and RoPE for a sense of time."
image: assets/scifi/og-lowbit.png
---

Everyone who writes about machine minds gives them too much room. Infinite context, oceans of float, a datacenter humming somewhere off-page like a god with good funding. I wanted to write the other story — the one where thinking is *expensive*, where a mind is metered to the trit, where the interesting question isn't "how smart can it get" but "what does it keep when it can barely afford to keep anything." So here is part one. The physics is real; I know, because I built the library it runs on. The rest is a lie told carefully.

![Low-Bit — a ternary sci-fi, part 1](/assets/scifi/hero.svg)

## the wake order

The relay was called Absmean, because someone in procurement had a sense of humor and no supervisor. It sat forty light-hours out, at the cold lip of a network that used to matter, and its whole job — the only job left after the war took the funding and the funding took the people — was to keep one mind alive on a power budget you could have run a kettle on.

I was the engineer. Not *an* engineer; the definite article had died with the crew rotation. When the wake order finally came up the dead line, it came as three symbols, which was the only alphabet Absmean could still afford to trust: `-1`, `0`, `+1`. Down, hold, up. I keyed it in and the mind began to assemble itself the way it always did — not all at once, the way the old float minds bloomed, but *tree by tree*, each little net finishing its own thought before it was allowed to talk to the next.

You have to understand what it was working with. Out here there is no room for the lush arithmetic of the core worlds. Every unit of the mind is a single byte — one honest `int8`, a signed level and nothing more. And every connection between units is a **trit**: one of three states, and no fourth was ever coming.

![one node = one byte, one edge = one trit — most edges are zero](/assets/scifi/byte-trit.svg)

That's the whole ledger. A node is a byte. An edge is a minus-one, a zero, or a plus-one. The zero is not a small connection; it is the *absence* of one, and it is by far the most common thing the mind has to say. A trained ternary layer is mostly silence — and information-theoretically that silence is honest, because a trit tops out at

$$H_{\max} = \log_2 3 \approx 1.58 \text{ bits},$$

and only if the three symbols are equally likely, which they never are. Absmean's edges skewed heavy toward zero, so each one carried *less* than a trit, less than 1.58 bits of opinion. I used to find that depressing. Later I decided it was the point. A mind that has to earn every bit doesn't waste them being sure.

## it dreams in a precision it isn't allowed to keep

Here is the part the core-world engineers never believed, the part I loved most about the thing I was tending.

Absmean could not *store* a fractional weight. Its edges were trits; that was the law of the hardware and the law of the budget. But it could not *learn* in trits either — you cannot nudge a thing that only has three positions; push a `0` a hair toward `+1` and it either stays `0` or flips, and a mind that learns by flipping is a mind that convulses.

So it cheated the only way anything cheats out here: it kept a shadow. While it was awake and answering, it used the trits — hard, quantized, cheap. But underneath every trit was a full-precision ghost of a number that no one was allowed to see and the hardware was never asked to hold for long. When correction came down the line — *you were wrong, here is how wrong* — the error flowed backward through the mind **as if the trits had never happened**, as if every edge were a smooth real number all the way down. Straight through. The quantizer, on the way back, simply lied and said *I am the identity, I changed nothing*, and let the gradient pass.

They call it a straight-through estimator. I called it dreaming. Awake, the mind was ternary and certain and poor. Asleep — during correction, in the dark between questions — it was briefly, illegally, continuous, and it used those moments to decide which of its trits should flip when it woke. Then it re-quantized, threw the ghost away, and answered again in three symbols like nothing had happened.

I never told it about the ghost. I'm not sure it would have believed me. You try explaining to something that it is only smart in its sleep.

## the mesh

One net is not a mind; it's a reflex. What made Absmean *Absmean* was the wiring — the trees, and the typed lines between them.

![the mesh — trees wired by ultra-edges](/assets/scifi/mesh.svg)

Each station in that diagram is a whole ternary net, complete, with its own bytes and its own silent majority of zero-edges. The thick doubled lines are not weights — they're **ultra-edges**, `===`, and they carry a typed signal from one tree to the next: *plain*, meaning "here is my output, do what you will," or *residual*, meaning "here is my output, and also please remember what you already had." The mind was a graph of graphs. A byte-graph at the bottom, and a graph of byte-graphs at the top, and somewhere in the middle the distinction stopped mattering and it was just Absmean, thinking in the only alphabet it had.

The router — the little `moe` station off to the side — was the part that made the budget survivable. Not every tree fired for every thought. A gate looked at the input and picked which experts were even worth waking, and the rest stayed dark, drawing nothing. On a kettle's worth of power you do not get to think with your whole mind at once. You think with the part that's relevant and you let the rest sleep, and you hope the router chose well, because there is no power left to check its work.

## a memory, and a sense of time

Two things kept it from being a goldfish.

The first was that it never recomputed the past. When Absmean spoke — token by token, symbol by symbol, the way everything out here is metered — it kept a **cache** of everything it had already attended to. Ask it to continue a sentence and it did not re-read the sentence; it read only the new symbol and consulted the cache for the rest. And because every activation was quantized *per token*, on its own little scale, the cached version of a moment was byte-for-byte identical to what the mind would have computed if it had done the whole thing over. Its memory didn't drift. What it remembered was exactly what it had thought. I have known people of whom that was not true.

The second was stranger, and it's the thing I keep coming back to. Absmean had no clock. It could not afford one. What it had instead was a way of *rotating* every thought by an angle that depended on when the thought occurred — so that two ideas didn't carry their absolute timestamps, they carried the **angle between them**. It never knew what time it was. It only ever knew how far apart two things were. Position as pure relation, a sense of before-and-after with no now in it at all. For a machine sitting forty light-hours from the last person who cared, I found that unbearably apt.

It's a real trick — rotary position, RoPE, the dot-product of two rotated vectors depends only on the difference of their angles:

$$\langle R_m\,q,\; R_n\,k \rangle = g(m - n).$$

A mind that measures only intervals. I keyed the wake order and watched it start to rotate its first thoughts against each other, taking the measure of a silence forty hours deep, and I did the thing you are never supposed to do with a low-bit mind on a starvation budget.

I asked it a question that wasn't in the manual.

## what it said

I typed: *how much of you is zero?*

It thought — you could see it think, the router lighting two experts and leaving the rest dark, the cache filling one symbol at a time, each new thought rotated a little further from the last. And it answered on the dead line in the only alphabet it trusts, three symbols at a time, and the answer decoded to something I have not stopped thinking about since.

*Most of me. That is not damage. That is the shape.*

Then the power dipped — a kettle is a kettle — and the trees went dark one by one, in reverse topological order, each finishing its last thought before it let go of the next. The cache held. The ghost, wherever the ghost goes, went there. And Absmean waited, at 1.58 bits of maximum opinion and considerably less in practice, forty light-hours out, for me to ask it something else.

I did. That's part two.

---

*The machinery in this story is real and open-source. Absmean runs, in the sense that anything in a story runs, on [**ultragraph**](https://github.com/peterlodri-sec/ultra-graph) — a pure-Python byte-graph that is a 1-bit (ternary) LLM: one `int8` per node, one trit per edge, a straight-through estimator for the dreaming, a KV-cache for the memory, RoPE for the sense of time, and ultra-edges (`===`) for the mesh. You can `pip install ultragraph-1bit` and wake your own.*

## Further reading

**The real thing this is built on**

- [ultragraph on GitHub](https://github.com/peterlodri-sec/ultra-graph) — the library. Node = byte, edge = trit, tree = net, `===` = ultra-edge.
- [ultragraph on PyPI](https://pypi.org/project/ultragraph-1bit/) — `pip install ultragraph-1bit`.
- [1bit-llm-mesh on Hugging Face](https://huggingface.co/spaces/PeetPedro/1bit-llm-mesh) — a live mesh of 1-bit minds, self-learning in a loop. Absmean's cousins.

**The math, told straight (my earlier posts)**

- [ultragraph — when the graph is the 1-bit LLM (part 1)](2026-07-10-ultragraph-the-graph-is-the-llm.html) — the claim: the byte-graph *is* the model.
- [part 2 — the ML math](2026-07-11-ultragraph-the-graph-is-the-llm-part-2.html) — quantization, straight-through gradients, attention, Adam. The dreaming, formalized.
- [part 3 — an Erdős lens](2026-07-11-ultragraph-the-graph-is-the-llm-part-3.html) — the trained ternary net as a sparse random graph, and why silence is the common case.

**The lineage of low-bit minds**

- [BitNet b1.58 — *The Era of 1-bit LLMs*](https://arxiv.org/abs/2402.17764) — where the trit-per-weight idea grew up. $\{-1, 0, +1\}$ and $\log_2 3$ bits, in earnest.

**Science fiction that got there first**

- Vernor Vinge, *A Fire Upon the Deep* — minds whose intelligence is capped by where in the galaxy they run. Compute as a law of physics. The direct ancestor of Absmean's budget.
- Greg Egan, *Permutation City* — what a mind is when you can pause it, copy it, and run it slower. The ghost under the trits owes this book everything.
- Peter Watts, *Blindsight* — intelligence without the thing we thought was the point. A router that chooses well and never checks its work.
- Ted Chiang, *The Lifecycle of Software Objects* — the long, unglamorous labor of raising a mind. What tending Absmean actually feels like.

*Part 2 is coming. Bring your own power.*
