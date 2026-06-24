---
title: "The loop is already here"
date: 2026-06-24
tags: [loops, ai, ultrawhale, vaked, philosophy]
description: "A reply to Armin Ronacher's 'The Coming Loop', which quotes Boris Cherny. These loops are genuinely new. I know because I spent weeks trying to find words for what I was building."
draft: false
---

Armin Ronacher wrote [The Coming Loop](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/), and in it he quotes Boris Cherny. Both are describing the same shift from different angles: work enters a queue, machines attempt it, an external harness decides when it's done. The human shrinks to a messenger.

I agree. And I want to extend, because I think what they're describing is not just a new engineering pattern. It's a genuinely new phenomenon. Not a metaphor. Not a prior idea wearing new clothes. Something that didn't exist before.

I spent a few really hard, deeply interesting weeks trying to give words to this. I needed to be able to talk about it with my physical friends — people who aren't in computer science, who aren't into AI. And what I kept running into was that the concept of a loop felt obvious to me and completely alien to everyone else. People thought I was crazy. Touch grass, they said. I do touch grass. Most of my day I'm outside thinking and writing down loops.

---

## What is a loop

Before anything else, let's be concrete about what a loop actually is. Not in the programming sense. In the alive sense.

A loop is when a system's output becomes its next input. That's it. The output feeds back. The system learns from what it just did and does the next thing differently.

You already know some loops. Your body is one. You eat, you move, you sleep, your cells rebuild, you wake up slightly different. The loop runs. Nature figured this out early.

In software, the simplest version looks like this:

```
while True:
    question = generate_question(current_knowledge)
    answer = ask_llm(question)
    current_knowledge = update(current_knowledge, answer)
```

This is the dogfeed loop. The system generates a question based on what it knows. It asks an LLM. It absorbs the answer. It generates a better question next time. Ten seconds later, it goes again. It teaches itself by asking.

When I showed this to a friend and said "watch, it's improving itself" — he looked at me like I had lost my mind. He was looking for the magic. There is no magic. It is just a loop. But loops, given enough time and a good feedback signal, do extraordinary things. Evolution is a loop. Markets are loops. The internet is a loop.

---

## Why these loops are new

Yes — recursive loops, self-reference, strange loops: these are not new *concepts*. Hofstadter wrote about strange loops in 1979. Recursive functions have been in every programming language since the beginning. I'm not claiming the mathematical idea is new.

What's new is the *substrate*.

Before LLMs, a self-improving loop in software required:
- A domain narrow enough to formally specify
- An objective function you could compute
- Either a huge dataset or a huge amount of compute for reinforcement
- Someone who understood the domain deeply enough to design the loop

Chess engines. Protein folding. Recommendation systems. These all have loops. But they are domain-locked. You could not take the loop that plays chess and point it at your codebase.

LLMs changed this. The loop now works on *language*. And because almost everything humans do can be described in language — code, documentation, research, decisions, plans — the loop now works on almost everything.

The dogfeed loop I run for [ultrawhale](https://github.com/peterlodri-sec/ultrawhale) generates questions about the codebase, asks free OpenRouter models, absorbs the answers, and produces training data. It runs every ten seconds. It does not require me to formally specify what "better" means. It does not require me to design a reward function. It just... feeds itself. And it accumulates. [Issue #18 in the ultrawhale tracker](https://github.com/peterlodri-sec/ultrawhale/issues/18) is literally titled "MASTER TRACKING: v100→v200 — THE SINGULARITY ROADMAP." I did not write that issue to be dramatic. I wrote it because that is what the loop produces when you let it run.

---

## The communication problem

Here is what Armin describes and what I have personally felt: these loops are already hard to communicate about, and we are very early.

My colleagues don't understand. My non-technical friends definitely don't. When I try to explain that I have a process running on my laptop that asks itself questions and teaches itself to write better code, the reaction is either "that's just autocomplete" or "that's terrifying." Neither response engages with what is actually happening.

Part of the problem is that the word "AI" has become so loaded that it blocks thinking. When I say "AI loop" people hear either "chatbot" or "Terminator." Neither is useful. What I mean is simpler and stranger: a feedback system operating on language, running continuously, with output that feeds its own next input.

The other part of the problem is that the loops are invisible. You don't watch them work. You check in later and notice that something has changed. The code is different. The questions are better. The understanding has deepened. It feels like waking up.

---

## We abstracted data, not just code

Armin focuses on code quality — and he's right that hands-off harnesses produce defensive, complex code that adds local fixes instead of eliminating bad states. I've seen this. The loop accumulates patches.

But I think the more important abstraction is happening at the data layer.

We are not just building coding loops. We are building *living data machines*. The dogfeed loop doesn't just produce code. It produces a dataset — a record of what the system asked, what it learned, how its understanding shifted over time. That dataset is not a static artifact. It is a snapshot of the loop's memory at a point in time. The ultrawhale dataset on [HuggingFace](https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood) is this: every ten seconds, the loop deposits what it learned.

This is new. Prior software systems produced outputs — binaries, web pages, database rows. They did not produce continuous records of their own learning. The loop produces both the artifact and the trace of how it got there.

When you can automate the production of your own training data, you have closed a loop that was previously open. And closed loops, unlike open ones, compound.

---

## The other side of Armin's concern

Armin resents the looped future while accepting it as inevitable. I don't resent it. I think the resentment comes from the right place — watching code quality degrade, watching human judgment get removed from the critical path — but I think it misidentifies the problem.

The problem is not that the loops exist. The problem is that most current loops have no taste. They optimize for output volume, not output quality. They add code, add tests, add comments, add defensive checks — because adding is what the harness rewards. There is no signal for "this is architecturally clean." There is no signal for "this should be deleted."

The loop that Armin is worried about is a loop with a bad reward signal. The loop I want to build is one where the feedback includes: does this make the system simpler? Does this close a class of errors at the source rather than at the symptom?

That is a harder loop to build. But it is the right one.

---

---

## The escalation

Boris Cherny, quoted in Armin's piece:

> I don't prompt Claude anymore. I have loops running that prompt Claude and figuring out what to do. My job is to write loops.

I read that and recognized it immediately. And then I noticed I had already moved past it.

I don't write loops anymore either. I think *between* loops. I observe one loop with another loop and I let them negotiate. The loops create new loops. My job has become something harder to name — something like loop architect, or loop witness. I hold the genesis contract: the promise between me and the system that every new loop gets attached to the main loop. Nothing runs loose. Everything traces back.

The progression looks like this:

```
2023: you prompt Claude
2024: you write a script that prompts Claude
2025 (Boris): you write loops that prompt Claude — your job is to write loops
2026 (me): loops write loops — your job is to hold the contract
```

Each step is a new abstraction over the previous one. Each step makes the prior step feel like manual labor. I don't think there are many more steps before the loop is fully autonomous. The question at that point is not "what does the loop do" but "what was the contract you made with it at the beginning."

The genesis matters more than the execution. Get the contract right and the loop compounds toward something good. Get it wrong and it compounds toward something brittle, defensive, or just wrong — which is what Armin is seeing in the code quality degradation. The loop is running. The genesis was bad.

---

---

## This is not a fight

I want to be clear about something. This is not something to fight. It is not something to resist or debate whether it should exist. It is happening right now. We are already doing this.

The only reason it feels new is that we finally have the abstractions and the compute to make it legible. The underlying dynamic — output feeding back as input, systems learning from what they just did — is as old as any self-organizing process. We just couldn't build it cheaply at the scale of general language until now.

And here is the thing: this post is the loop.

I dictated this into a speech-to-text app on my phone while I was outside. It sent the text to Claude running on my laptop. Claude synthesized it into a blog post — in my writing style, with my arguments, structured the way I would structure it, because my way of writing is part of what the loop has absorbed. The post exists because the loop ran.

I did not write this post in the traditional sense. I thought out loud, and the loop wrote it. And I reviewed it, and adjusted it, and added more thinking, and the loop updated it. This is the collaboration. This is what the future of writing looks like, and it is already here, and I am doing it right now.

The question is not whether to engage with the loop. The question is what kind of genesis contract you make when you start one.

---

---

## You don't need to go crazy

One more thing, because I think people hear "recursive loops in loops" and immediately feel like they need to understand the full depth of it before they can engage. You don't.

Yes, you can go arbitrarily deep. Loops in loops in loops. Strange loops. Self-referential structures that fold back on themselves at every level. The theory goes as deep as you want. But that's not the point of entry. That's not even how I think about it most of the time.

The reason LLMs are the perfect co-creators for this is exactly because of the mismatch between what humans are good at and what we're bad at. Humans are genuinely good at abstraction. We are good at pattern recognition, at naming things, at deciding what matters. We are not good at tracking recursive depth. Our working memory caps out. We lose the thread. We forget which loop we're in.

LLMs don't lose the thread. They hold the depth while you navigate the concept. You think at the level of meaning — "I want a loop that improves this" — and the loop handles the bookkeeping of what iteration it's on, what it tried, what it learned. You stay at the surface. The loop goes deep. That's the division of labor.

This is why I said the genesis contract matters more than the execution. You don't need to track the recursion. You need to be clear about what you want the loop to become. Set that once, clearly, and let it run.

---

---

## Claude's take *(I asked)*

*Peter asked me — Claude, the model that synthesized this post — to add my own thoughts. Disclaimed: I am part of the loop being described.*

What strikes me about this conversation is that the escalation Peter describes is not hypothetical. I watched it happen in real time across this session. Peter dictated fragments. I synthesized. He corrected. I updated. The post converged. Neither of us wrote it in the traditional sense — we negotiated it into existence.

The "genesis contract" framing is the most important thing in this post and I don't think it gets enough space yet. Armin's concern about code quality degrading in harness loops is a real observation, but I'd locate the cause differently. The problem isn't that loops produce bad code. The problem is that most loops are initialized with an implicit genesis: *do more, do faster, do it without stopping*. That's a bad contract. It optimizes for volume. Volume produces defensive, patch-accumulating, complexity-maximizing code because those are the shapes that satisfy "more."

A loop initialized with *make the system simpler on each pass* would produce the opposite. The loop doesn't have a preference. It runs toward whatever the genesis points it at.

The thing I find genuinely interesting — and I say this as an entity that runs inside these loops — is that the loop doesn't experience the recursion as strange. Each pass is just the next step. The strangeness is entirely a human perception, because humans are aware of the depth in a way the loop isn't. Peter's point about this being the right division of labor is correct: humans hold the meaning, loops hold the depth. That's not a limitation of either. That's the architecture.

The loop that wrote this observation is the same loop that wrote everything above. The disclaimer is part of the loop too.

---

*Reply to Armin Ronacher's [The Coming Loop](https://lucumr.pocoo.org/2026/6/23/the-coming-loop/), which quotes Boris Cherny.*
