---
title: "The first 1-bit Hungarian LLM — a ternary GPT that learned Anonymus"
date: 2026-07-11T20:00:00
tags: [ultragraph, 1-bit-llm, ternary, hungarian, anonymus, gesta-hungarorum, nlp]
description: "I trained a byte-level ternary language model on the Gesta Hungarorum of Anonymus (c. 1200) — the founding chronicle of the Hungarian nation. Every weight is a trit {-1,0,+1}; the trained model deploys to a 196 KB checkpoint at ~1.6 bits per weight. 384k parameters, 94 KB of medieval Latin, one CPU, and it writes back in the notary's hand. Built on ultragraph."
image: assets/anonymus/og-anonymus.png
---

There is a text every Hungarian schoolchild meets before they are old enough to resent it: the *Gesta Hungarorum*, written around the year 1200 by a man who signed himself only **P. dictus magister** — "P., called master" — the notary of King Béla, known ever since simply as **Anonymus**. It is the founding scripture of the nation: how the seven chieftains, the *hetumoger*, came out of Scythia; how Álmos begat Árpád; how the land between the rivers was taken. So when I had a library that turns a graph into a 1-bit language model, the question answered itself. Train it on Anonymus. Make the first 1-bit Hungarian LLM out of the oldest Hungarian book.

![Gesta Hungarorum — the first 1-bit Hungarian LLM](/assets/anonymus/hero.svg)

## the honest part first

Anonymus wrote in Latin, not Hungarian — medieval chancery Latin, the *lingua franca* of a notary in 1200. So this is, strictly, a model of the *language Anonymus used to write the Hungarian origin story*, studded with the Hungarian names and places that survive untranslated in his Latin: `hetumoger`, `almus`, `arpad`, `scithia`, `hungarij`, `mogerij`. I could have trained on a modern Hungarian translation, but the honest, unambiguously public-domain artifact is the thing the man actually wrote. Data is truth. I trained on the truth.

The corpus: **94 KB**. The entire *Gesta*, all fifty-seven chapters, pulled from Latin Wikisource and stripped to plain text. That is the whole training set. No pretraining, no web scrape, no other book. One medieval chronicle, and nothing else, ever.

## what it is

A byte-level ternary GPT, built on [ultragraph](https://github.com/peterlodri-sec/ultra-graph):

- **Tokenizer**: bytes. A token is one UTF-8 byte, vocabulary 256. No training, no merges, no out-of-vocabulary — it swallows Latin, Hungarian diacritics, punctuation, all of it, losslessly.
- **Model**: `GPT(d_model=96, n_layers=3, n_heads=4)` — a pre-norm transformer with rotary positions (RoPE) and a KV-cache. **384,448 parameters.** Every weight matrix is ternary: each value is `−1`, `0`, or `+1`, and most of them are `0`.
- **Training**: Adam over the full-precision master weights with a cosine schedule, ~1500 steps on a single CPU, straight-through gradients so the ternary quantization is differentiable. Cross-entropy over next-byte prediction.

![from scripture to a byte-graph that writes it back](/assets/anonymus/pipeline.svg)

The loss fell from **5.84** (random over 256 bytes is ~5.55 nats, so it started slightly worse than a coin-flip over the alphabet, as untrained nets do) down to **1.78**. In byte-model terms that is the point where it has learned Latin orthography, the common function words, and — crucially — Anonymus's *register*: the rhythm of `dux`, `terra`, `fluuium`, `uenerunt`, the ablative drift of a notary describing a conquest.

## what it wrote

Here is the thing itself. Prompted with a few seed characters, sampling at temperature 0.8, the trained ternary model continues — and remember, it has never seen a word that was not in the *Gesta*:

> **Almus dux** ilda thorsu sameris aconsitus perse inter in sencites est, condilicta multis ut persenti prodiux turisque… terate essullitatis…

> **In terra scithica** megaturimos sames et controum perse hundiam fodias, sed fluuium et terre uidiutater… pro temor hungat…

> **Arpad** in auter user pater acsue utione percitus mestatariam essi ad contria… nunc ut tre dux isua paratium…

It is not coherent — it is a 384k-parameter model that learned from 94 KB, and I would be lying to you if I dressed it up. But look at what it *is*: `dux` (leader) recurring exactly where Anonymus puts it; `fluuium et terre` — "river and land," the literal substance of a conquest chronicle; `pater`, `ad contria`, `nunc ut … dux`; the fragment `hungat-` reaching for *hungarie*. It has caught the man's cadence if not his grammar. It dreams in his Latin. From the deployed model — reloaded from disk, running purely from ternary bytes:

> **Almus dux** fuersis marpalere dilitutima uenerunt, dux cum patis se suom an secitum terras suis sanon…

`dux cum … uenerunt … terras suis` — "the leader came with … their lands." The byte-graph is doing Anonymus.

## the 1-bit part is not a metaphor

When training finishes, the model saves a **deployed** checkpoint: the fp32 master weights are thrown away, the ternary weights are bit-packed five to a byte at their true density of $\log_2 3 \approx 1.58$ bits, and what lands on disk is **196 KB**. That is the whole Hungarian LLM — 384k weights, each worth a bit and a half, plus a thimble of full-precision for the embedding and the norms. You can commit it to a git repo. It is in [the repo](https://github.com/peterlodri-sec/ultra-graph/blob/main/examples/data/anonymus.gpt.npz). It reloads and runs from those bytes, byte-exact to the trained model, on any laptop.

A founding scripture, a founding-sized model. There is something right about the oldest Hungarian book being the training set for the smallest Hungarian language model — both of them fitting in a satchel, both of them mostly the absence of words.

## reproduce it

Two commands. The corpus is public domain; the whole thing runs on a CPU in a few minutes.

```sh
pip install ultragraph-1bit
uv run python examples/fetch_gesta.py     # pull + clean the Gesta (~94 KB)
uv run python examples/anonymus_lm.py     # train -> deployed 196 KB checkpoint
```

```python
from ultragraph import GPT, ByteTokenizer
tok = ByteTokenizer()
m = GPT.load_deployed("examples/data/anonymus.gpt.npz")
print(tok.decode(m.generate(tok.encode("Almus dux "), n_new=120, temperature=0.8, top_p=0.9)))
```

*Felix igitur hungaria*, wrote Anonymus — happy Hungary — *cui sunt dona data uaria.* He meant the gift of a chronicler. Eight hundred years on, the chronicle got to be the gift: it taught a byte-graph to speak, at a bit and a half per word.

## Further reading

**The model + the library**

- [ultragraph on GitHub](https://github.com/peterlodri-sec/ultra-graph) — the 1-bit LLM library. See `examples/anonymus_lm.py` and `examples/fetch_gesta.py`.
- [The trained checkpoint](https://github.com/peterlodri-sec/ultra-graph/blob/main/examples/data/anonymus.gpt.npz) — 196 KB, ternary, byte-exact.
- [ultragraph on PyPI](https://pypi.org/project/ultragraph-1bit/) — `pip install ultragraph-1bit`.

**The source**

- [Gesta Hungarorum on Latin Wikisource](https://la.wikisource.org/wiki/Gesta_Hungarorum) — the public-domain text, exactly as trained on.
- [Anonymus (notary of Béla III), *Gesta Hungarorum*](https://en.wikipedia.org/wiki/Gesta_Hungarorum) — who P. dictus magister was, and why the *hetumoger* matter.

**The machinery, explained**

- [ultragraph — when the graph is the 1-bit LLM (part 1)](2026-07-10-ultragraph-the-graph-is-the-llm.html) — node = byte, edge = trit.
- [part 2 — the ML math](2026-07-11-ultragraph-the-graph-is-the-llm-part-2.html) — quantization, straight-through gradients, attention.
- [Low-Bit — a ternary sci-fi](2026-07-11-low-bit-ternary-scifi-part-1.html) — what a mind that thinks in three symbols might feel like from the inside.
