---
title: "Reduce till it's a loop"
date: 2026-06-24
tags: [vaked, compilers, lambda-calculus, loops, staged-computation, ultrawhale]
description: "The vaked-lambda post ends with 'known values disappear.' What about unknown ones? They become the input to a loop. The loop's job is to make unknowns into knowns — at which point they disappear too."
draft: false
---

The [previous post on vaked-lambda](/posts/2026-06-11-vaked-lambda-reduce-to-kernel.html) ends with a principle: *known values don't just optimize — they disappear*. A config function that reads `MASTODON_VISIBILITY` and returns one of four strings reduces, when the env var is known at build time, to a single `Lit` node. One string. No dispatch, no branches, no IR. The function is gone.

What happens to the unknown values?

They don't disappear. They become a residual — the minimal dispatch needed to resolve them later, at boot or at runtime. The lambda reduction pass does everything it can at build time and hands off what remains.

This is staged computation: push decisions to the earliest possible moment. If you know a value at compile time, compile it in. If you don't, emit the smallest possible thing that can figure it out later.

And the "later" part is a loop.

---

## The two sides of the same operation

Lambda reduction handles the known side. The compiler sees a pure function, knows some inputs at build time, runs to a fixed point, and emits:
- a `constexpr` where the term closed, or
- a `BootConfig` seam where it didn't

The dogfeed loop handles the unknown side. It generates a question, asks an LLM, absorbs the answer, updates `current_knowledge`. The unknown at time *t* may be known at time *t + 1*. It runs to a fixed point too — not a term fixed point, but an epistemic one: the moment you know enough to act.

Both operations share the same structure:

```
apply(transform, state)
  if fixed_point(state): return state
  else: recurse
```

Lambda reduction runs this at build time over a term. The dogfeed loop runs this at training time over a corpus. The loop that runs ultrawhale's harness runs this at inference time over a task. The structure is the same at every scale.

---

## What the loop is reducing

In the lambda reduction, the thing being reduced is uncertainty about a value. Ten nodes encode the full dispatch tree for `MASTODON_VISIBILITY`. One node encodes the answer. Reduction eliminates the structure that was only there because we didn't know the answer yet.

In the feedback loop, the thing being reduced is uncertainty about what to build. The dogfeed loop asks questions about the codebase, absorbs answers, and updates a model of what's good. The open terms — the things we don't know yet — are the inputs. Each iteration closes some of them.

The key insight: **the loop is the runtime of the residual**. When lambda reduction leaves an open term, it's not saying "we failed." It's saying "this requires a runtime decision." The runtime is the loop.

---

## The asymmetry

Lambda reduction runs once and terminates. The output is permanent: a `constexpr` compiled into the binary, or a seam wired at boot. Once the binary exists, the reduction is over.

The feedback loop runs forever, or until you stop it. Each pass produces an output that feeds the next pass. The output is not permanent in the same way — it updates the state rather than crystallizing into an artifact.

But this asymmetry is not as sharp as it sounds. The dogfeed loop does produce permanent artifacts: the JSONL files, the Parquet batches, the Hugging Face dataset. Each batch is a closed term. The loop emitted it and moved on. The next iteration runs against an updated state that includes what was just closed.

So the loop, too, produces a stream of permanent artifacts. It just produces them continuously rather than once.

---

## The genesis contract, formally

When you start a feedback loop, you make an implicit commitment about what you're reducing. If you don't make it explicit, the loop reduces toward whatever the feedback signal happens to reward. In practice, this is usually volume: more tokens, more commits, more defensive checks. The loop is reducing uncertainty about "have we done enough work?" and the answer is never yes.

The genesis contract is making the reduction target explicit before the loop starts. What I want to reduce is uncertainty about *this specific thing*. The loop should run until that thing is known, not until some proxy measure of effort is satisfied.

In the lambda reduction framing: the contract is the set of free variables in the open term. The loop runs until those variables are bound. Everything else — the dispatch structure, the intermediate nodes — is scaffolding that should disappear once the variables are known.

This is why Armin's observation about loop-generated code accumulating defensive complexity is exactly right. Those loops have a bad genesis contract. The implicit reduction target is "make the CI green" or "add enough error handling." The loop runs toward that target and adds structure everywhere because structure satisfies it. The result is code with many closed terms and a lot of unnecessary scaffolding that was never designed to disappear.

---

## What comes next in vaked-lambda

The lambda post ends honestly: "the wiring between the emitted modules and the actual build systems is still manual." The `BootConfig` seam compiles, but someone has to wire it to the real boot config. The `mcconf.module` descriptor is correct, but someone has to include it in the actual MyThOS build.

The next step is closing that loop. Not metaphorically — literally: a loop that takes an emitted open term, attempts to wire it into a target kernel build, observes whether it links, and either succeeds or reports what's still open.

This is the same structure as everything above. The open term (unlinked seam) is the input. The loop runs. Either the term closes (links successfully, nothing left to wire) or a new residual appears (a symbol that still needs a provider). The loop hands that residual to the next iteration.

At the end, when everything links: the config function has fully disappeared from the source, been compiled through two reduction passes at build time, emitted as a constant or a minimal seam, wired into the kernel, and linked. The lambda that originally read an env var at runtime now either doesn't exist in the binary or exists as a single wire to the kernel's boot parameter store.

That's the full reduction. Reduce till it's a constant. Wire the residual. Loop until it links.

---

## The unified picture

Staged computation and feedback loops are not different things. They are the same operation applied at different scopes and timescales.

- **Lambda reduction**: reduce at compile time, emit the residual to boot
- **Boot wiring**: reduce at boot time, emit the residual to runtime  
- **Runtime loop**: reduce at inference time, emit what was learned to the next training pass
- **Training loop**: reduce the training objective, emit to the deployed model

At each stage, known things disappear into constants. Unknown things become the input to the next stage's loop. The loop at each stage is the runtime of the previous stage's residual.

The thing that makes this tractable rather than infinite is the genesis contract at each stage. You define what "known enough to close" means. When that condition is met, the loop terminates and the closed artifact moves to the next stage.

*Known values disappear. Unknown values become the input to a loop. The loop makes more things known. Then they disappear too.*

---

## Peter's piece

*I asked Peter five questions. This is what he said.*

I didn't discover the connection the way you might expect. The local subagent tool calls started acting weird — taking 5, 10, 15 minutes — and succeeding, and generating really awesome code with logs that looked like iterations. I noticed the loop through its behavior, not through theory. I'm not even entirely sure that's the moment. That's just what I remember.

The local loop running right now is new — I started it a couple of days ago. It's rough. It feeds my previous conversations from every coding agent I've used, plus topics I'm interested in and usually searching for. Running QwQ 3.6 (32B) locally, plus another loop on my other MacBook using OpenRouter free models. Two loops, different hardware, different models. I don't have a formal name for this setup. It's an experiment.

When I leave an open term — a seam that doesn't link yet — that's not uncomfortable. That's the point. I don't need to know the correct term for what I'm doing. I don't need to prove anything. It's interesting, and I'm already using it. That's enough. Research doesn't need to be finished to be real.

Every day leads to the next wiring. I don't know yet what the loop that closes the manual gap looks like. I'm still thinking about it.

The thing I want people to understand — and they probably won't get it from the technical writing — is that we've attached really negative or really inflated weight to certain words. AI. LLM. Loop. Recursion. The words have baggage that makes people either defensive or scared before they've tried anything. That baggage shadows how you see what's actually there.

Just try things. Be brave. Don't be afraid of slop and experiments.

The two MacBooks: one running Ollama with QwQ 3.6 locally, the other hitting Gemma 120B on OpenRouter. They're not talking to each other — two independent experiments running in parallel. The loops are only a few days old so I can't back anything up with numbers. But anecdotally: QwQ tends toward longer output, more new concepts introduced, more further reading suggested. Whether that's the model or the setup or just noise — I don't know yet.

If I had to replace "AI loop" with something that doesn't carry the baggage — I'd say **data loop**. Or **data bot**. Something that describes what it actually is: a thing that moves data, transforms it, feeds it forward. Not a mind. Not a threat. Just a loop over data.

— peter
