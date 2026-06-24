---
title: "Form the tool to ourselves"
date: 2026-06-24
tags: [philosophy, ai, openness, loops, hallucination]
description: "The word anti-AI exists because people can't see what the tool actually does. The path forward is making it fully open, fully transparent — so there's nothing to fear and everything to use."
draft: false
---

I've been thinking about why the word "anti-AI" even exists.

Not why people are skeptical — skepticism is fine, skepticism is healthy. But the specifically defensive, fearful version of it. The kind that shuts conversations down before they start.

I think the reason is simple: people can't see the thing they're afraid of. They can't see what a hallucination actually is — it sounds like a word for a computer going insane, generating lies, becoming unpredictable. It sounds dangerous in a way that a software bug doesn't sound dangerous.

But a hallucination is just a confidence miscalibration. The model was trained on patterns; it produced a pattern that fit the context but wasn't grounded in fact. That's a solvable problem. We can attach trust scores. We can build retrieval. We can show our work. The tool is not broken — it's just not explaining itself yet.

---

## The gap a closed tool creates

Every tool that's been introduced to civilization has created a gap. Some people get it first, build with it, move faster. Others are left figuring it out. That gap — the advantage of early access — has always existed.

LLMs are different in one specific way: they're uniquely positioned to be fully open. The research is published. The weights are increasingly public. The APIs are accessible on free tiers. The loops that improve them can run on a laptop. There is no hardware moat the way there was for, say, a printing press or a steam engine. The barrier is knowledge and familiarity, not physical capital.

That means the gap is optional. If we choose to leave it open, it stays open. If we choose to close it — by making the tooling proprietary, the APIs expensive, the interfaces opaque — then we've recreated the old pattern with new materials.

Linus Torvalds said recently that he's pro-AI. Of course he is. It's a tool. It's a new tool. Every time civilization has introduced a new tool, we've done remarkable things with it. The question isn't whether to use it. The question is who shapes the tool and for whom.

---

## What a trust score would change

If responses came with trust scores — not just confident text but confidence + evidence trail + "here's what I'm uncertain about" — the hallucination fear dissolves. The problem wasn't that the model was wrong. The problem was that the model was wrong and looked completely certain.

A response that says "I'm 90% confident in this, here are the sources, and here's what I couldn't verify" is a useful response. It's how a careful expert talks. It's how we should want AI to talk.

We have the technology to do this. Retrieval-augmented generation exists. Uncertainty quantification exists. Structured citations exist. What we don't have is universal adoption, because building it requires prioritizing transparency over fluency. Fluent answers feel better. They demo better. They generate fewer follow-up questions.

But they're worse. And people, at some level, know they're worse. The uncanny fluency is part of what makes people distrust the output — not that the model is wrong, but that it doesn't *seem* to know it might be wrong.

---

## Open LLM servers

The most direct path I can see: public LLM servers. Fully open weights, accessible to anyone, funded by the organizations that benefit from widespread AI literacy. Not a product with a free tier. An actual public utility.

This exists in partial form already. Hugging Face Inference API. Ollama on local hardware. OpenRouter free models. The infrastructure is nearly there. What's missing is the framing — the explicit commitment that this is a public resource, not a user acquisition funnel.

If you can train your own agent on your own data, on your own machine, using open weights, and you understand what the training loop did and why the model behaves the way it does — you are not afraid of the tool. You're using it. You understand it. You can see it.

The fear lives in the opacity. Open up the opacity and the fear recedes.

---

## Form the tool to ourselves

Linus's phrase has stuck with me: a new tool, and we usually do pretty amazing things with it.

The emphasis I want to add: we form it to ourselves. The tool is not finished. The tool is not decided. The norms around how it's used, how it's explained, how it distributes access and benefit — none of that is locked in. The window where those things can be shaped is open right now, and it won't stay open indefinitely.

The people who are doing the shaping right now — the ones writing loops, publishing weights, building open tooling, documenting what they've learned — they're not special. They just started earlier. The work is available to anyone who wants to do it.

That's the point. That's always been the point.

— peter

---

*Previous: [slop is data](/posts/2026-06-24-slop-is-data.html)*
