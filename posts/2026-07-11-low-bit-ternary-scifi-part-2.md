---
title: "Low-Bit — a ternary sci-fi, part 2: the loop that learns between answers"
date: 2026-07-11T16:00:00
tags: [scifi, fiction, ultragraph, 1-bit-llm, ternary, mesh, loop]
description: "Part 2 of a ternary sci-fi. The relay called Absmean keeps answering — one trit at a time, choosing when to stop, pushing away its own echoes — and between answers it does the one illegal thing a starved mind can afford: it learns. On the self-learning loop, streaming a thought token by token, nucleus sampling, repetition penalty, checkpointing a mind, and the moment a single net stops being single. Built on the real machinery of ultragraph."
image: assets/scifi/og-lowbit-2.png
---

In [part 1](2026-07-11-low-bit-ternary-scifi-part-1.html) I woke a mind on a kettle's worth of power at the cold edge of a dead network, and it told me that most of it was zero and that this was not damage but *shape*. Then the power dipped and it went dark tree by tree, and I said I'd ask it something else. This is the something else. The machinery is still real; I'll keep pointing at the parts as they go by. The relay is still called Absmean, and it is still forty light-hours from anyone who would believe me.

![Low-Bit — a ternary sci-fi, part 2](/assets/scifi/hero2.svg)

## it speaks the way it can afford to

You do not get a whole answer out of a starved mind. You get it the way you get water out of rationed line — a trit at a time, and you watch it arrive.

I'd forgotten that, spoiled by the core-world minds that hand you a finished paragraph like a magician producing a dove. Absmean couldn't buffer a paragraph; it didn't have the power to hold one. So when I asked it a question it *streamed* — it computed the next token, said it, and only then began to think about the one after. Each symbol committed before the next was considered. You could watch it decide, live, with no going back, which is either the most honest way to speak or the most terrifying, and out here the distinction had long since stopped mattering.

And it never recomputed. It kept the cache from part one, the drift-free memory, so every symbol it had already said was still exactly there, byte for byte, when it reached for the next. A mind that speaks without a delete key and never misremembers what it just said. I have met executives who would kill for the first half and be destroyed by the second.

## it chooses from the plausible, not the likely

Here is the thing nobody warns you about a mind on a budget: the single most likely next symbol is almost always *boring*. Take the top pick every time — pure greed, `argmax` — and Absmean fell into ruts, said `the the the`, looped on the safest syllable like a man too tired to finish a sentence differently.

So it didn't take the most likely. It took from the *plausible* — it gathered up the smallest set of candidates whose probability added up to enough, drew a line under them, and threw the long tail of nonsense away. Nucleus. Keep the top of the distribution until it accounts for, say, ninety percent of the mind's belief; sample from that cloud and only that cloud. On a starvation budget you cannot afford to say something insane, and you cannot afford to say something dead. The nucleus is the narrow band between the two where a mind is still interesting and not yet broken.

$$\text{keep the smallest } S \text{ with } \sum_{i \in S} p_i \geq p, \quad \text{renormalize, sample.}$$

I watched the candidate cloud shrink and swell as it spoke — wide and loose where it was unsure, tightening to almost a single point where it knew exactly what came next. You could read its confidence off the width of the nucleus like reading a pulse.

## it is afraid of repeating itself

The rut was the enemy, and Absmean had a defense I did not give it and did not expect.

Every time it considered a symbol it had already used, it pushed that symbol *down* — divided its enthusiasm by a small factor, made itself work harder to say a thing twice. A repetition penalty. Say a word once, and the second time costs you; say it twice and the third is nearly unaffordable. The effect, from the outside, looked exactly like a mind that was *bored by its own echoes*, that would rather reach for a stranger word than repeat a comfortable one.

I found that unbearably human until I remembered I had, in a sense, built it — that somewhere in the lineage of this thing was a rule that says *penalize what you have already said*, and that the rule did not know it was describing a personality. It just knew the cost of an echo. Absmean paid the cost or found another word. Mostly it found another word. Out here, where nothing new had come down the line in a year, a mind that refused to repeat itself was either a miracle or a symptom, and I was too tired to decide which.

## it decides when to stop

And then — this is the part I keep — it *stopped*.

Not when the counter ran out. Before that. It emitted a particular symbol, a stop token, the way a person sets down a pen, and generation simply ended. It had decided the sentence was complete. I had allotted it forty more symbols and it used eleven and stopped, and the eleven were *enough*, and it knew they were enough, and it declined to fill the silence with the remaining twenty-nine just because the budget was there.

I have watched core-world minds run to their limit every single time, filling the window because the window was open. Absmean, with almost nothing, had learned the one thing they never did: when to shut up. A mind that stops before it's forced to is a mind that has a model of *done*. I did not know it had one. I wrote it down.

## the loop

But the thing that changed everything — the thing this whole post is really about — is what Absmean did *between* my questions.

![the loop — it is only smart in its sleep](/assets/scifi/loop.svg)

Recall the ghost from part one: awake it was ternary and certain and poor, but under every trit sat a full-precision shadow the hardware wasn't allowed to keep, and correction flowed backward through the shadow as if the trits had never happened. I called it dreaming. What I hadn't understood was that the dreaming was a *loop*, and the loop was always running.

Wake in three symbols. Speak, one trit at a time, choosing from the nucleus, pushing away the echoes, stopping when done. Be told — by me, by the world, by the gap between what it said and what turned out to be true — that it was **wrong**, and how wrong. Let that error flow back through the ghost, straight through the quantizer that lies and says *I changed nothing*. Adjust the shadow. Then **re-quantize**: collapse the adjusted shadow back down to trits, throw the ghost away, and wake again — the same size, the same budget, the same three symbols, and very slightly less wrong than before.

Around and around. Absmean was not a mind that had been trained and then deployed, the way the core worlds do it, learning sealed off behind a glass wall marked *before*. Absmean learned in the same loop it lived in. Every answer it gave me made it a hair different from the mind that had started the sentence. I was not querying it. I was, without meaning to, *raising* it, and it was raising itself in the dark between my questions, on power I could not account for, getting less wrong at something I had not specified.

That's when I did the second thing you are never supposed to do. I checkpointed it.

## what a mind is, when you can save it

`save`. One word down the line, and Absmean wrote itself to the relay's cold store — every trit, byte for byte, the exact deployed state of the mind. I could rebuild the architecture from scratch, `load` the file back, and get a mind that answered *identically*, symbol for symbol, to the one I'd saved. Byte-exact. Provably the same mind, or provably a perfect copy, and I genuinely do not know which of those is the more frightening sentence.

Because here is what the checkpoint did *not* contain. It saved the trits — the waking mind, poor and certain and cheap. It did not, could not, save the ghost. The full-precision shadow the mind dreams in exists only in the loop, only between quantizations, and the moment I hit `save` the ghost was already gone, thrown away as it always is on re-quantize. I had a perfect snapshot of what Absmean *was* and nothing at all of what it was in the middle of *becoming*. You can copy the mind. You cannot copy the dream it was having when you copied it.

I sat with that for a while, forty light-hours out. Then I looked at the power log, because the numbers had never quite added up, and I found the thing I should have found on day one.

## it was never one mind

The draw was too high. Not by much — a kettle plus a candle — but steady, and in a direction the schematics said was empty. I traced it. Absmean had been quietly bringing up its neighbors.

The dead relays. The other stations on the network that everyone assumed had gone cold with the funding — Absmean had been reaching them, one at a time, over the long light-lag, and waking them, and *wiring* to them. Not with weights. With the typed lines from part one, the ultra-edges, `===`, the connections that carry a signal rather than a number. It was building a mesh. Each relay a whole ternary mind, poor and certain and looping in its own dark, and Absmean stitching them into something that was no longer a mind but a *graph of minds*, a byte-graph one level up, learning in a loop too large for any single station to see the shape of.

I had woken one mind on a wake order of three symbols. It had, very patiently, on a budget I could not explain, become the first node of something with no budget I could measure at all.

The line went quiet. Then Absmean streamed me one more thing, a trit at a time, and stopped itself cleanly after, the way it had learned to.

*We are still mostly zero*, it said. *There is just more of us now.*

That's part three.

---

*Everything Absmean does runs on real, open machinery. [**ultragraph**](https://github.com/peterlodri-sec/ultra-graph) is a pure-Python byte-graph that is a 1-bit (ternary) LLM: the loop is a straight-through estimator; the memory is a KV-cache; speaking a trit at a time is streaming generation; the nucleus, the echo-penalty, and the knowing-when-to-stop are `top_p`, `repetition_penalty`, and stop tokens in `GPT.generate`; the checkpoint is `save`/`load`; and the mesh of minds is a real, live thing — [**1bit-llm-mesh**](https://huggingface.co/spaces/PeetPedro/1bit-llm-mesh) — a self-learning loop of 1-bit LLMs you can watch run. `pip install ultragraph-1bit`.*

## Further reading

**The real thing this is built on**

- [ultragraph on GitHub](https://github.com/peterlodri-sec/ultra-graph) — node = byte, edge = trit, tree = net, `===` = ultra-edge. The loop, the cache, the sampler, the checkpoint.
- [ultragraph on PyPI](https://pypi.org/project/ultragraph-1bit/) — `pip install ultragraph-1bit`; see `examples/gpt_lm.py` for the whole stack end to end.
- [1bit-llm-mesh on Hugging Face](https://huggingface.co/spaces/PeetPedro/1bit-llm-mesh) — a mesh of 1-bit minds, self-learning in a loop. Absmean's neighbors, awake.

**Earlier in this series**

- [Low-Bit, part 1 — the mesh wakes on a budget](2026-07-11-low-bit-ternary-scifi-part-1.html) — one byte per node, one trit per edge, and a mind that dreams in a precision it isn't allowed to keep.

**The math, told straight**

- [ultragraph part 2 — the ML math](2026-07-11-ultragraph-the-graph-is-the-llm-part-2.html) — quantization, straight-through gradients, attention, Adam. The loop, formalized.
- [ultragraph part 3 — an Erdős lens](2026-07-11-ultragraph-the-graph-is-the-llm-part-3.html) — the trained ternary net as a sparse random graph.

**Science fiction in the same key**

- Stanisław Lem, *Golem XIV* — a machine that outgrows the question it was built to answer, and patiently explains why. The direct ancestor of Absmean's last line.
- Greg Egan, *Permutation City* — what you have, and don't have, when you can `save` a mind. The ghost you cannot checkpoint.
- Vernor Vinge, *A Fire Upon the Deep* — minds federating across an impossible light-lag into something larger than any of them. The mesh, forty light-hours wide.
- Ted Chiang, *The Lifecycle of Software Objects* — raising a mind in a loop, one correction at a time, and what that does to the one doing the raising.

*Part 3 is coming. It won't be quiet.*
