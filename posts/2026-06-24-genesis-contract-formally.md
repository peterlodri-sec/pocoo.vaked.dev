---
title: "The genesis contract, formally"
date: 2026-06-24
tags: [loops, genesis, philosophy, vaked, compilers]
description: "A backref and expansion. The genesis contract appeared in 'reduce till it's a loop' as a brief idea. It deserves a full treatment: what it is, why it matters, how to write one, and what happens when you don't."
draft: false
---

*This is a backref to [reduce till it's a loop](/posts/2026-06-24-reduce-till-its-a-loop.html), which introduced the genesis contract in passing. The idea kept growing after I wrote it, so here it is in full.*

---

A feedback loop is not a neutral machine. Every loop encodes a judgment about what counts as progress. That judgment — stated or unstated, deliberate or accidental — is the genesis contract.

The name comes from a simple observation: the first iteration of any loop shapes every subsequent one. Not by constraining the path, but by setting the attractor. The loop runs toward something. The genesis contract is the specification of what that something is.

---

## Definition

A genesis contract is a commitment, made at loop initialization, that answers four questions:

1. **What is the loop trying to reduce?** Not "what does it do" but what uncertainty, cost, or distance is it minimizing?
2. **What counts as a valid iteration?** What makes one pass better than another?
3. **When does the loop terminate?** What does "done enough" look like?
4. **What must never be sacrificed?** Which properties are invariant — not optional, not tradeoffs, but protected?

If you cannot answer these four questions before you start the loop, you do not have a genesis contract. You have a loop running toward whatever the feedback signal happens to reward, which is usually volume.

---

## Why it matters

Armin Ronacher wrote about code quality degrading in agentic loops. The pattern: loops that optimize for CI green, test coverage, or "added features" produce defensive, complex, patch-accumulating code. The loop is running correctly. The genesis contract was bad.

The four-question check on a typical bad contract:
1. **Reducing:** uncertainty about whether CI passes
2. **Valid iteration:** CI goes green, tests run, no linting errors
3. **Terminate:** never — the loop keeps adding until stopped
4. **Invariants:** none specified

That contract rewards adding. Adding tests, adding guards, adding error handling. It never asks whether the addition was necessary. The code gets heavier with each iteration not because the loop is broken but because heaviness satisfies the contract.

A better contract:
1. **Reducing:** the number of open unknown requirements
2. **Valid iteration:** an iteration that closes at least one unknown without introducing new ones
3. **Terminate:** all knowns resolved, no open residuals
4. **Invariants:** net line count must not increase; every addition requires a deletion elsewhere

Same loop structure. Entirely different trajectory.

---

## The vaked-lambda case

The lambda reduction work ([reduce till it's a constant](/posts/2026-06-11-vaked-lambda-reduce-to-kernel.html)) is a formal example of a genesis contract enforced by type theory.

The contract:
1. **Reducing:** the number of `EnvVar` nodes in the IR (unknown values)
2. **Valid iteration:** beta-reduction or constant-folding applies to at least one subterm
3. **Terminate:** no rewrite rule applies (fixed point)
4. **Invariants:** the reduced term must be observationally equivalent to the original; no `EnvVar` node may be dropped — only resolved or preserved

The `normalize()` function enforces this mechanically. You cannot write a loop iteration that violates invariant 4 because the type system won't let the term typecheck. The genesis contract is not prose — it's code.

That's the formal limit: a genesis contract that can be checked at each step, not just at the end. The loop doesn't just run toward the contract; it proves compliance on every iteration.

---

## The informal limit

Most loops can't be fully formalized. The dogfeed loop, the Ralph loop, the agentic development loop — these operate on language, which resists mechanical verification. For these, the genesis contract is prose, held in the human's head, enforced by code review and judgment.

The risk: prose contracts drift. The human forgets which questions they answered, or never answered question 4, or updates the contract silently when the loop produces something inconvenient. The loop keeps running under the updated contract as if nothing changed.

The mitigation: write the genesis contract down, explicitly, before the first iteration. Treat it like the preamble to a law — the statement of purpose that constrains all future interpretation. When the loop produces something that satisfies the signal but violates the preamble, that's a contract breach. Stop. Revise.

---

## Writing a genesis contract

A genesis contract for a software development loop:

> **Reducing:** the gap between the current implementation and a specified behavior.
>
> **Valid iteration:** any pass that reduces behavioral gap without increasing cognitive load (measured by: can a new developer understand the change without the commit message?).
>
> **Terminate:** behavioral gap is zero. No new tests are failing. No open requirements are unaddressed.
>
> **Invariants:** the complexity budget is fixed — each addition must be justified by a corresponding simplification elsewhere. Existing tests must not be deleted to make new tests pass. The diff must be explainable in one sentence.

That's four sentences. It's not a spec. It's a contract — a commitment about what the loop is *for*, so you know when it's working and when it isn't.

---

## The loop-writing-loops case

When loops write loops — when the output of one loop is the genesis contract of the next — the parent loop's contract implicitly constrains all children. This is why the parent contract matters more than any individual iteration.

A parent loop with a bad contract (optimize for volume, terminate never) will generate child loops with contracts it chose, which will be volume-oriented, which will generate grandchild loops in the same image.

A parent loop with a good contract (reduce specific uncertainty, protect invariants, terminate when done) propagates that discipline downward. Child loops inherit the parent's values even when they write their own contracts, because the contracts they generate are shaped by what the parent was rewarding.

This is why the genesis contract is the primitive. Not the loop architecture, not the model, not the tooling. The contract comes first. Everything else is implementation.

---

---

## Peter's invariant

*I asked for a personal invariant — something non-negotiable, something that if violated would stop the loop.*

If the loop doesn't recognize within three turns that what I'm telling it is true — and that it was wrong — I pause and inject something. Change the prompt, change the framing, change the context. Something has to shift.

This is the correctable loop invariant. The loop must be able to update its model of what's true when shown evidence it was wrong. Not immediately — that would make it sycophantic, always capitulating. But within three turns, given clear evidence, the loop should converge.

If it doesn't, it's not reasoning. It's stuck. And a stuck loop is worse than no loop — it accumulates confidence in a wrong direction.

The mechanism I imagine for this is similar to the full-stop primitive in [vaked](https://protocol.vaked.dev): a signal that halts execution cleanly when a structural invariant is violated, rather than continuing into a broken state. Not a crash — a deliberate stop, followed by intervention.

The invariant: *if the loop cannot be corrected by evidence within three turns, stop it, inject, restart.*

That's the test. Not "is the output good?" but "is the loop correctable?" A loop that produces mediocre output but can be steered is better than a loop that produces confident output but can't be redirected. The second one is dangerous. The first one is a tool.

---

## Worked example: the free loop guide

The [end-to-end loop guide](/posts/2026-06-24-your-first-free-infinite-loop.html) includes a concrete genesis contract for a learning loop:

> **Reducing:** gaps in understanding of a topic  
> **Valid iteration:** the answer introduces at least one concept not in the previous 5 answers  
> **Terminate:** when you can explain the topic to a non-expert in 5 minutes  
> **Invariants:** answers must be checkable; no unfounded claims accepted

That contract produces a loop that runs toward depth, not volume. Run the same loop without a contract and it produces repetition — the first 10 iterations keep asking "what is X?" in slightly different words because there's nothing stopping it.

The invariant clause is the most important. It's what prevents the loop from satisfying the signal while destroying the value. Without it, a loop that "reduces gaps in understanding" will happily reduce gaps by accepting false answers — which is technically gap reduction, just the wrong kind.

---

*See also: [the loop is already here](/posts/2026-06-24-the-loop-is-already-here.html) · [reduce till it's a loop](/posts/2026-06-24-reduce-till-its-a-loop.html) · [the correctable loop](/posts/2026-06-24-the-correctable-loop.html) · [compressing the loop](/posts/2026-06-24-compressing-the-loop.html) · [your first free loop](/posts/2026-06-24-your-first-free-infinite-loop.html)*
