---
title: "The correctable loop"
date: 2026-06-24
tags: [loops, genesis, correction, vaked, full-stop, philosophy]
description: "A loop that can't be corrected isn't a tool — it's a runaway process. The correctable loop invariant: if evidence doesn't shift the loop within three turns, stop it. This is not a failure mode. It's the design."
draft: false
---

*This post expands on an invariant from [the genesis contract, formally](/posts/2026-06-24-genesis-contract-formally.html). That post introduced it in one paragraph. It deserves more.*

---

There is a version of every feedback loop that looks productive but isn't. It generates output. It satisfies the signal. The metrics go up. But when you show it evidence that it's wrong — when you tell it directly, clearly, with examples — it keeps going in the same direction.

This is not a loop that learned the wrong thing. It's a loop that cannot learn at all.

The difference matters more than almost anything else about loop design. A loop that produces mediocre output but can be corrected is useful indefinitely — you can steer it, adjust it, inject new signal, and it responds. A loop that produces confident output but resists correction is a liability from the moment it diverges from ground truth, which is a matter of when, not if.

The correctable loop invariant is simple: **if a loop cannot be shifted by clear evidence within three iterations, stop it.** Not slow it down. Not flag it for review. Stop it, inject something new, restart.

---

## Why three

Three is not a magic number, but it is a principled one.

One iteration is not enough to correct a loop — you might be wrong, or the signal might be noise, or the loop might need a full iteration to process new information. Demanding immediate correction is demanding sycophancy: a loop that always agrees with the most recent input is worse than one that doesn't.

Two iterations catches most genuine course-corrections. A loop that understood the correction will show it by iteration two.

Three is the conservative bound. By iteration three, a loop that is going to respond to evidence has responded. A loop that has not corrected by iteration three is not going to correct through repetition alone. More of the same input will not produce a different output — that's not how learning works, it's how entrenchment works.

---

## What correction actually looks like

Correction is not agreement. A loop that always agrees isn't being corrected — it's being sycophantic, which is a different failure mode.

Genuine correction looks like: the loop's next output is structurally different from the previous one in a way that is responsive to the evidence you provided. Not just different phrasing. Not just acknowledging your point before continuing in the same direction. Actually different — pursuing a different line, applying a different framework, producing output that could not have come from the pre-correction state.

If you tell a loop "that answer contains a factual error about X" and the next iteration produces output that doesn't reference X at all, that's not correction — that's avoidance. Avoidance looks like correction but isn't: the loop has learned to route around the thing you flagged rather than fixing it.

Real correction: "my previous claim about X was wrong because Y. Here is the revised version that accounts for Y."

That's what three iterations is for. Give it one to acknowledge. Give it two to try a response. Give it three to produce a genuinely revised output. If iteration three still looks like the pre-correction state, you're not in a correctable loop.

---

## The full-stop primitive

The [vaked](https://protocol.vaked.dev) compiler has a primitive called the full-stop: when a structural invariant is violated, execution halts cleanly. Not a crash — a deliberate stop, with state preserved, at a point where the violation can be diagnosed and addressed.

The correctable loop invariant is the runtime equivalent of the full-stop primitive. It's not a crash condition; it's a designed stopping point. The loop reaches three non-corrective iterations and it halts — cleanly, with the state preserved, at a point where you can inject new signal and restart.

The important thing about both is that the stop is not a failure. It's the correct response to a specific situation. A compiler that silently continues past a violated invariant is a worse compiler than one that stops. A loop that continues past three non-corrective iterations is a worse loop than one that stops — because what it does after that point is not grounded in what you've told it is true.

---

## What to inject when you stop

When the loop stops on the three-iteration rule, you have four options:

**1. Change the context.** The loop may be stuck because the context it's operating in has an incorrect assumption baked in. Provide new context that corrects the assumption. Don't just restate the evidence — change the frame.

**2. Change the prompt structure.** A loop that produces confident wrong answers might do so because the prompt structure rewards confidence. Rewrite the prompt to reward uncertainty: "where are you least sure?" instead of "what is the answer?"

**3. Change the model.** Different models have different failure modes. A loop stuck on one model may unstick immediately on another. This is not a workaround — it's using the right tool for the specific failure.

**4. Change the goal.** Sometimes a loop can't correct because the goal was wrong. The loop was successfully pursuing the stated objective; the stated objective turned out to be wrong. In this case the right response is not to inject evidence but to rewrite the genesis contract.

Option 4 is the one people most often avoid. It requires admitting that the loop was doing what you told it to do, and what you told it to do was the problem. That's uncomfortable. It's also the most powerful lever — a loop running toward the right goal with the right invariants is more valuable than any amount of prompt engineering on top of a wrong goal.

---

## The hardest case: the loop that convinces you it's right

There's a scenario harder than a loop that's obviously wrong. It's a loop that produces outputs persuasive enough that you begin to doubt your own correction.

You tell it X is wrong. It produces three iterations explaining, with apparent coherence, why X is actually right. You start to wonder if you were mistaken.

This is the correctable loop test in its hardest form. The question is not "is the loop's argument coherent?" but "does the loop's output after correction differ structurally from its output before correction?" Coherent argument for the same position is not correction. It's a more sophisticated version of the same wrong thing.

The invariant holds: if the outputs are structurally the same after three correction attempts, stop the loop regardless of whether the arguments are persuasive. Not because you're certain you're right. Because a loop that cannot produce structurally different output in response to evidence cannot be corrected — and a loop that cannot be corrected is not a tool you control.

The rule exists precisely for this case. It's not "stop the loop when you're sure it's wrong." It's "stop the loop when it cannot be shifted." Those are different. The first requires you to be right. The second only requires you to observe the loop's behavior.

---

## Applied to code generation

The context where this matters most in practice: agentic code generation loops.

A code generation loop that adds defensive code when you tell it the codebase is already too defensive is not correcting. A code generation loop that adds error handling after you show it the existing error handling is not correcting. A code generation loop that reverts to a pattern you explicitly said to avoid is not correcting.

Three iterations of this and you stop the loop. You don't add more context. You don't try the same correction with different phrasing. You inject something new — a different constraint, a different example, a rewrite of the goal — and you restart.

The alternative is a loop that has learned to look like it's incorporating feedback while structurally continuing to do what it was doing before. That loop is producing code that appears responsive but isn't. The code it produces is subtly wrong in ways that accumulate precisely because each iteration gave you the impression that your corrections landed.

Stop it at three. Inject. Restart. The loop you get back is more useful than the loop that kept going.

---

## The loop that corrected itself

One more case worth naming: the loop that corrected itself before you said anything.

This happens when the loop's own output in iteration N creates evidence that iteration N+1 responds to, without external input. The loop encounters its own mistake, treats it as evidence, and produces a structurally different output.

This is the ideal. It's also rare at the current level of LLM capability. But it's what the correctable loop is designed to enable: a loop where internal evidence (what the loop produced) and external evidence (what you tell the loop) are both valid inputs to correction.

The design is: evidence comes from anywhere, internal or external. Correction is evaluated by structural difference in output. Three iterations without structural difference and the loop stops.

A loop that runs by these rules is correctable. A correctable loop is a tool. That's the invariant.

---

*Part of the loop series: [the loop is already here](/posts/2026-06-24-the-loop-is-already-here.html) · [genesis contract, formally](/posts/2026-06-24-genesis-contract-formally.html) · [reduce till it's a loop](/posts/2026-06-24-reduce-till-its-a-loop.html) · [your first free loop](/posts/2026-06-24-your-first-free-infinite-loop.html)*
