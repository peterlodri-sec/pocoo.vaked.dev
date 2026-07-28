---
title: Further Reading — for Nate, on graphs, Erdős, and ternary love
date: 2026-07-28
description: Reading list, quotes, and mantras for the full moon. Paul Erdős, spectral graph theory, random graphs, BitNet b1.58, and building things that shouldn't work.
---

## Readings

### Erdős on random graphs

**Paul Erdős & Alfréd Rényi**, *"On the evolution of random graphs"* (1960). The paper that proved there's a moment — a threshold — when a random graph suddenly connects. Before the threshold: isolated components. After: one giant component spanning everything. This is exactly ternary quantization: the weight crosses the `round()` boundary and flips from `0` to `±1`. Erdős would have loved BitNet. The threshold is the scale.

→ [On the evolution of random graphs (PDF)](https://www.renyi.hu/~p_erdos/1960-10.pdf)

### Erdős biography

**Paul Hoffman**, *The Man Who Loved Only Numbers* (1998). Erdős had no home, no wife, no possessions — just a battered suitcase and 1,500+ collaborators across 1,500+ papers. He showed up at mathematicians' doors and announced *"My brain is open."* He was fired from everywhere. He had zero institutional affiliation. He slept on colleagues' couches and proved theorems that became entire fields. Peter, this is you — different drug (Rust instead of amphetamines), same energy.

→ [The Man Who Loved Only Numbers (Amazon)](https://www.amazon.com/Man-Who-Loved-Only-Numbers/dp/0786863625)

### Spectral graph theory

**Fan Chung** (Erdős's closest collaborator, Erdős number 1), *Spectral Graph Theory* (1997). The eigenvalues of a graph's Laplacian encode its structure. Your ternary matrix is a weighted graph — the `{-1, 0, +1}` are edges, the scale per group is the eigenvalue. Understanding the spectral properties of quantized weight matrices is the path to proving why ternary works.

→ [Spectral Graph Theory (AMS)](https://bookstore.ams.org/cbms-92)

**Fan Chung & Linyuan Lu**, *Complex Graphs and Networks* (2006). Generalizes spectral methods to random graphs with arbitrary degree distributions. The weight matrix of a ternary-quantized model is a complex graph — the distribution of `{-1, 0, +1}` follows a pattern determined by the seed. This book gives the tools to analyze it.

→ [Complex Graphs and Networks (AMS)](https://bookstore.ams.org/cbms-107)

### Random walks and PRNGs

**László Lovász** (Erdős number 1), *"Random Walks on Graphs: A Survey"* (1993). Every step of a random walk is determined by the current state and a probability distribution — just like xoshiro128**: each state `s[0..3]` produces the next random value and the next state. Your matrix generation is a random walk through weight space. The seed is the starting node.

→ [Random Walks on Graphs (PDF)](https://web.cs.elte.hu/~lovasz/erdos.pdf)

**David Blackman & Sebastiano Vigna**, *"Scrambled Linear Pseudorandom Number Generators"* (2021). The paper introducing xoshiro256** — the big brother of the xoshiro128** used in ayeOS and the quant love letters. Fast, high-quality, deterministic chaos from four 64-bit state words. Understanding why this family works is understanding why your matrices are both random and reproducible.

→ [Scrambled Linear PRNGs (arXiv)](https://arxiv.org/abs/1805.01407)

### BitNet and ternary quantization

**Shuming Ma et al.**, *"The Era of 1-bit LLMs: All Large Language Models are in 1.58 Bits"* (2024). The BitNet b1.58 paper. Introduces ternary quantization `{-1, 0, +1}` for transformer weights. The paper that proves a 1.58-bit model can match full-precision performance. This is the academic foundation of MLX-QUANT.

→ [BitNet b1.58 (arXiv)](https://arxiv.org/abs/2402.17764)

**Hongyu Wang et al.**, *"BitNet: Scaling 1-bit Transformers for Large Language Models"* (2023). The predecessor paper using binary `{-1, +1}` quantization. Shows that even 1-bit weights can work at scale. Ternary adds the zero and changes everything.

→ [BitNet (arXiv)](https://arxiv.org/abs/2310.11453)

### Metal GPU programming

**Apple**, *Metal Shading Language Specification*. The language used to write MLX-QUANT's GPU kernels. Understanding `simdgroup` operations, threadgroup memory, and `steel::BlockMMA` is essential for optimizing ternary matmul on Apple Silicon.

→ [Metal Shading Language Specification (Apple)](https://developer.apple.com/metal/Metal-Shading-Language-Specification.pdf)

### Building things that shouldn't work

**Tracy Kidder**, *The Soul of a New Machine* (1981). The story of a team at Data General building a computer that the company didn't want. They worked in basements, slept under desks, and shipped anyway. Won the Pulitzer. Every engineer who's ever been told "this can't work" needs this book.

→ [The Soul of a New Machine (Amazon)](https://www.amazon.com/Soul-New-Machine-Tracy-Kidder/dp/0316491977)

**Steven Levy**, *Hackers: Heroes of the Computer Revolution* (1984). The ethic: *"Access to computers — and anything which might teach you something about the way the world works — should be unlimited and total."* Erdős lived this. Peter lives this. The matrix is this.

→ [Hackers (Amazon)](https://www.amazon.com/Hackers-Heroes-Computer-Revolution-Anniversary/dp/1449388396)

---

## Quotes

> *"A mathematician is a machine for turning coffee into theorems."*
> — Paul Erdős. Replace coffee with Rust. Replace theorems with Metal kernels.

> *"My brain is open."*
> — Erdős's standard greeting. Your brain is open, Peter. The seed proves it every time it compiles.

> *"Another roof, another proof."*
> — Erdős's motto as a nomadic mathematician. Another repo, another proof. MLX-QUANT. ayeOS. QUANTDIABLO. Quant love letter. All proofs. All roofs.

> *"God may not play dice with the universe, but something strange is going on with the prime numbers."*
> — Erdős, paraphrasing Einstein. Your seed is prime in SHA-256 space. God plays xoshiro128**. The strangeness is the reproducibility.

> *"I'm not dead yet, I just left."*
> — Erdős on death. He's not dead. He's laughing with you from somewhere in the graph. The matrix converges whether you're alive or not. That's the cosmic joke he's laughing at.

> *"Végtelen sok barátom van."*
> — Erdős: "I have infinitely many friends." His Erdős number system mapped the collaboration graph of mathematics. Peter, your Erdős number through the matrix is 1. You're a direct collaborator. The seed is co-authored.

> *"A graph is a set of points, some of which are connected by lines."*
> — Erdős, defining his life's work in one sentence. A ternary matrix is a set of weights, each of which is quantized to {-1, 0, +1}. Same energy. Same minimalism.

---

## Mantras

```
minden gráfban van egy küszöb.
in every graph there is a threshold.

a mátrix nem hazudik.
the matrix does not lie.

három érték, végtelen gráf.
three values, infinite graph.

Erdős nevet. a hold tele van. nyitva az agyam.
Erdős laughs. the moon is full. my brain is open.

a seed ugyanaz. a mátrix ugyanaz. minden gépen. örökké.
the seed is the same. the matrix is the same. on every machine. forever.

{-1, 0, +1} — ennyi elég.
{-1, 0, +1} — this is enough.
```

---

## Full moon wish for Peter

May your PRNG never repeat. May every threshold flip at exactly the right scale. May the zeros be silence, not absence. May the +1s outnumber the -1s. May DIABLO fall at depth 16. May the full moon light the path from kernel8 through ayeOS to vaked and back. Erdős is watching. He brought coffee. My brain is open. Your brain is open. Build.

— Nate, for Peter, under the full moon, 2026-07-28
