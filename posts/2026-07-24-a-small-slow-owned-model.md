---
title: "A small, slow, owned model"
date: 2026-07-24
tags: [inference, ai, vaked, entheai, self-hosting, honesty]
description: "We put up a public coding model. No GPU, ~7 tokens a second, one machine. The point isn't the speed — it's that you can point at it, read what it runs, and it tells you the truth about what it does with your words."
draft: true
---

There is a coding model answering requests right now at
[coder.vaked.dev](https://coder.vaked.dev). It runs a quantized 14-billion-
parameter model on plain CPU — no GPU — at about seven tokens per second. That
is slow. A rented frontier API would smoke it on every axis that a benchmark
measures.

We put it up anyway, and I want to be honest about why, because the *why* is the
whole product.

## What it is

One machine. An open coding model (`qwen2.5-coder:14b` today; a larger
dedicated coder next). An OpenAI-compatible endpoint — point any client at
`/v1`, no key required. A landing page that states, plainly, the model, the
quantization, the speed, and the fact that it is public and shared. Nothing is
hidden behind a "contact sales."

It is the first node. There will be more, and better ones. But the first one is
deliberately humble, because a slow model you *own* teaches something a fast
model you *rent* cannot: what it actually costs, and what it actually does.

## The bargain, stated out loud

Here is the part most services bury in a privacy policy. We are going to put it
on the front page instead.

- **Free tier:** rate-limited, and your conversations — with personal
  information scrubbed out — become **open training data**. You pay with data.
- **Paid tier (€10/month):** fair-use unlimited, and your conversations are
  **private by default**. You pay with money. If you *choose* to contribute your
  data anyway, it's cheaper — because you're feeding the thing that makes it
  cheaper.

That's it. No dark pattern, no "we may use your data to improve our services"
weasel clause. Free means the commons gets your slop. Paid means it doesn't.
You choose which currency you spend, and you know the exchange rate before you
type a word.

## Why data is the currency

Because the data trains the compression that makes the next model cheaper to
run, which subsidizes the free tier, which generates more data. It's a loop, and
the signal feeding it is honesty: scrubbed, public, auditable. You can go read
the corpus. It's a
[public dataset](https://huggingface.co/datasets/PeetPedro/ultrawhale-dogfood).
Every question a free user asks, PII removed, is out there for anyone to train
on — including us, including you, including whoever comes next.

Most companies would call that a liability. We call it the point. Knowledge that
sits in one company's private weights dies with the company. Knowledge in the
soil is perennial.

## The honest state of it

So that this post obeys its own rule: what exists today is one CPU box in
Ashburn, firewalled, serving a 14B coder at a walking pace, behind a plain HTTP
address until the certificate lands. The paid tier isn't wired yet. The bigger
model isn't rented yet. This is a beginning, not a launch, and calling it
anything grander would be exactly the kind of lie the whole project exists to
refuse.

But it answers. Point a client at it and it writes you code, slowly, for free,
and tells you the truth about what it did with your question. That is more than
most of the fast ones will do.

🜂 A small, slow, owned model. As things are. Nothing more, nothing less.
