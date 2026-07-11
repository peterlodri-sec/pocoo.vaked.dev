---
title: "ultragraph — when the graph is the 1-bit LLM, part 3: an Erdős lens"
date: 2026-07-11T12:00:00
tags: [ultragraph, graph-theory, erdos, random-graphs, probabilistic-method, ternary, 1-bit-llm, math]
description: "Part 3: reading the ternary byte-graph through Paul Erdős's graph theory — random graphs G(n,p), the giant-component phase transition, the probabilistic method (and its kinship with the straight-through estimator), Erdős–Gallai degree sequences, and Erdős–Stone extremal density. Lenses, not theorems — with the math."
image: assets/ultragraph/architecture.png
---

I built a graph library and then spent two posts pretending it was a language model. Fair enough — in [part 1](2026-07-10-ultragraph-the-graph-is-the-llm.html) I claimed the byte-graph *is* the LLM (node: one `int8`, edge: one ternary weight in $\{-1,0,+1\}$), and in [part 2](2026-07-11-ultragraph-the-graph-is-the-llm-part-2.html) I made it earn that claim with the ML math — quantization, straight-through gradients, attention, Adam grinding away in the dark. But there's a debt outstanding. The word *graph* has been sitting in the name this whole time, arms crossed, waiting for me to acknowledge that graph theory exists and has, on occasion, been done by people better than me.

So part 3 is the visit. I want to hold the byte-graph up to the light Paul Erdős worked by: random graphs $G(n,p)$ and the eerie moment near $p \approx 1/n$ where a giant component just *appears*; the probabilistic method, where you prove a thing exists by refusing to say which one; degree sequences and extremal density, the physics of how many edges you can cram in before structure forces your hand. Then I ask the honest question: what, if anything, do those say about a network whose every edge carries $-1$, $0$, or $+1$?

Fair warning, and I'll repeat it in bold later — these are **lenses and analogies**, not theorems about trained nets. A phase transition in $G(n,p)$ is not a proof about my optimizer's mood on Tuesday. Erdős would want that line drawn in permanent marker, and he'd be right.

He also called the cleanest proofs *The Book*, God's own. A ternary edge is 1.58 bits of opinion. Erdős would have Opinions. [Reading list](https://github.com/peterlodri-sec/ultra-graph/blob/main/docs/references.md) below; the coffee is already cold.

![ultragraph architecture — the byte-graph across micro / meso / macro](/assets/ultragraph/architecture.png)

## the byte-graph is (almost) a random graph

I spent a decade telling people that a neural network is a graph, and getting the polite nod reserved for the man who has clearly been alone with his whiteboard too long. Ultragraph finally makes the joke literal. Its weights are ternary, $W \in \{-1, 0, +1\}$, and a trained ternary matrix is mostly the middle option. The zeros are not connections. So the question "which unit talks to which" reduces to "where are the nonzeros," and that is a graph — a sparse one — and I cannot look at a sparse graph without hearing Erdős clear his throat.

Fix the distribution. Let each weight be signed with equal probability,

$$q = \Pr(W = +1) = \Pr(W = -1), \qquad \Pr(W = 0) = 1 - 2q,$$

so an edge exists — the weight is live — with probability $p = 2q$. In an $n \times m$ weight block the live edges number, in expectation,

$$\mathbb{E}[\text{edges}] = nmp,$$

because linearity of expectation asks for nothing and forgives everything. Squint at a single layer of $n$ units as an undirected $\mathrm{Erdős\text{–}Rényi}$ graph $G(n,p)$ and you get the familiar $\binom{n}{2}p$ expected edges. Same knob, $p$, doing all the work.

Now the part that should embarrass the marketing department. A ternary weight can carry at most $\log_2 3 \approx 1.58$ bits, and it only reaches that ceiling when all three symbols are equally likely. The true content is

$$H = -(1-2q)\log_2(1-2q) - 2q\log_2 q,$$

maximized at $q = 1/3$, where $\Pr(+1) = \Pr(-1) = \Pr(0) = 1/3$ and $H = \log_2 3$. But absmean quantization does not aim for $q = 1/3$. Trained ternary layers come out sparser — $p < 2/3$ — which pushes $q$ below $1/3$ and drags $H$ strictly under the ceiling. Every edge you keep carries *less* than 1.58 bits. The byte is emptier than the brochure, and the brochure was already promising you two-thirds of a trit.

![ternary weight bytes — mostly zero; the nonzeros are the graph](/assets/ultragraph/fig_ternary_weights.png)

I will not pretend this is a theorem. $G(n,p)$ assumes edges that are independent and identically distributed; trained weights are aggressively neither — they conspire, they cluster, they remember the loss surface that made them. Erdős would file my analogy under "physicist." Fine. But it is a *sharp* lens: nearly everything he cared about — components, giant components, the moment the whole thing coalesces — is decided by that one scalar $p$, the density of live edges. Hold that thought. The next section is where $p$ crosses a threshold and the graph stops being a scatter of debris and becomes, all at once, a single connected thing.

## the phase transition, or: when does a byte-graph wake up

Strip ultragraph down to a yes/no question — does this weight fire? — and the connectivity pattern of the surviving nonzero ternary weights is just a random graph. Fix the probability that any given edge carries live weight at $p$, and you are staring at $G(n,p)$, the object Erdős and Rényi built their evolution paper around. I find this unreasonably comforting: the most decorated result in random graph theory shows up uninvited in my quantization ablations.

Set $p = c/n$, so the mean degree — call it the mean fan-in per node — is $c = np$. Erdős and Rényi's theorem says the graph does not degrade gracefully as you turn $c$ down. It snaps. The order parameter is the fraction $\rho$ of nodes in the largest connected component, and it obeys

$$\rho = 1 - e^{-c\rho},$$

taking the largest root. This is the extinction complement of a Poisson$(c)$ branching process, and it has a positive solution *if and only if* $c > 1$. The transition is razor-sharp:

$$c < 1:\ \text{all components have size } O(\log n); \qquad c > 1:\ \text{a unique giant component of size } \Theta(n).$$

Below one, the graph is gravel — a scatter of logarithmic islands, each too small to matter. Above one, a single continent condenses out of the dust and everything else is footnotes. There is no polite in-between; at $c=1$ the largest component sits at the eerie intermediate scale $\Theta(n^{2/3})$ and then commits.

Now read that back onto ultragraph. Quantize too hard — prune too much, drive $p$ so low that mean fan-in $c < 1$ — and your live-weight graph shatters into $O(\log n)$ disconnected fragments. Signal entering the layer cannot reach the other side; the components are not large enough to span it. You have built a network that is technically present and functionally asleep: parameters resident, gradients defined, nothing percolating. There is, in other words, a **connectivity budget**. You need $np \gtrsim 1$ per layer just to keep the lights on.

I will be honest that this is intuition, not a theorem about trained nets. Real layers have structure, not i.i.d. edges, and the full-precision shadow weights riding along via the straight-through estimator quietly keep gradients flowing where the forward graph has gone dark. But the moral survives contact with reality: ternary sparsity has a floor, and below it the graph disconnects.

And note how expensive full connectivity is. Merely having a giant component costs you $c>1$; making the *entire* graph connected — no stragglers at all — waits until $p = \ln n / n$, a full factor of $\ln n$ higher. Waking up is cheap. Leaving nobody behind is not.

*Erdős, P. & Rényi, A. (1960), "On the evolution of random graphs," Publ. Math. Inst. Hungar. Acad. Sci. 5, 17–61.*

## the probabilistic method — Erdős's useful lie, and mine

Part 2 sold you a lie and called it a gradient. The straight-through estimator trains a ternary net by *pretending* the rounding on the forward pass was the identity on the backward pass. It is wrong, and it works. Before I defend that, I want to point at the oldest lie of this shape in the book — one told by a better liar.

In 1947 Erdős wanted a lower bound for the Ramsey number $R(k,k)$. He did not build a coloring. He colored the edges of $K_N$ by coin flip. A fixed set of $k$ vertices spans $\binom{k}{2}$ edges; the chance they all land one color is $2 \cdot 2^{-\binom{k}{2}} = 2^{1-\binom{k}{2}}$. By linearity — no independence required, which is the whole trick — the expected number of monochromatic $K_k$ is

$$\mathbb{E}[X] = \binom{N}{k}\, 2^{\,1-\binom{k}{2}}.$$

If $\mathbb{E}[X] < 1$, then *some* coloring realizes fewer than one such clique, i.e. none. Push $N$ as far as that inequality allows and you get

$$R(k,k) > 2^{k/2} \quad (k \ge 3).$$

A bound on a quantity nobody can compute, proved by a graph nobody exhibited. He refused to construct and won.

He did it again, harder, in 1959. Claim: for every $g$ and $k$ there is a graph with girth $> g$ *and* chromatic number $> k$ — locally tree-like, globally uncolorable, two properties that beg to contradict each other. Take $G(n,p)$ with $p = n^{\theta-1}$ and $0 < \theta < 1/g$. Short cycles are rare in expectation, so delete one vertex from each and few casualties result; independence numbers stay small enough that what survives still needs many colors. Existence certified. Structure never shown. He proved the impossible-sounding object is *typical*, then walked away without one.

That is exactly the STE move, in miniature. The true derivative of $\mathrm{round}(\cdot)$ is $0$ almost everywhere and undefined on a measure-zero fence. A literal-minded optimizer, handed that gradient, sits still forever — it is technically correct and completely useless. STE substitutes a plausible gradient, the identity through the quantizer, wrong at every point yet right enough *on average* to drag the fp32 shadow weights somewhere the ternary forward pass rewards. Erdős proved existence by refusing to construct; I find weights by refusing to differentiate honestly. Both cheat the pointwise truth and collect the aggregate one, because "with positive probability" and "in expectation" are usually all the leverage you have.

Be honest with yourself: this is a kinship of *spirit*, not a theorem. I am not claiming STE is the probabilistic method. But when your only foothold is an average, you take it — and you keep good company.

*Erdős, P. (1947), "Some remarks on the theory of graphs," Bull. AMS 53, 292–294; Erdős, P. (1959), "Graph theory and probability," Canad. J. Math. 11, 34–38.*

## degree sequences and how dense is too dense

Every unit in the byte-graph has a degree: count its nonzero ternary weights and you get a fan-in and a fan-out. Do this across a layer and you get a histogram. My instinct, always, is to trust the histogram. Erdős spent a career teaching people not to.

Start with the question of whether the histogram is even *legal*. Line the degrees up non-increasing, $d_1 \ge d_2 \ge \dots \ge d_n$. The Erdős–Gallai theorem (1960) says this is the degree sequence of an actual simple graph if and only if $\sum_i d_i$ is even and, for every $k \in \{1,\dots,n\}$,

$$\sum_{i=1}^{k} d_i \;\le\; k(k-1) + \sum_{i=k+1}^{n} \min(d_i, k).$$

Read it as an accountant would. The left side is the degree the top $k$ vertices demand. On the right, $k(k-1)$ is every edge they could possibly spend among themselves, and each remaining vertex can absorb at most $\min(d_i,k)$ of the overflow. Demand more than the world can supply and no graph exists. So when a pruning scheme hands me a fan-in histogram, I get to ask a sharp question: is this thing *graphic*? If it fails Erdős–Gallai, the pruner didn't compress my layer, it hallucinated one — the connectivity it claims cannot be realized by any wiring at all.

The other ceiling is about density, and it is less forgiving. Erdős–Stone (1946), the so-called fundamental theorem of extremal graph theory, says that for a fixed forbidden $H$ with chromatic number $\chi(H)$, the most edges an $n$-vertex graph can carry while avoiding a copy of $H$ is

$$\mathrm{ex}(n, H) = \left(1 - \frac{1}{\chi(H)-1} + o(1)\right)\binom{n}{2}.$$

Turán's theorem is the honest special case: forbid $K_{r+1}$, get $\chi = r+1$, and the density bound collapses to $1 - 1/r$. The lesson is brutal and structural. Density and forbidden substructure trade off against each other on a fixed exchange rate. There is a hard ceiling of edges you get *for free*; cross it and the clique you were trying to avoid becomes unavoidable — not likely, unavoidable. This is the same wall I keep walking into when I crank the density $p$ and expect the graph to stay clean and modular. The substructure I didn't want was priced into the edge count all along.

Am I cheating? A little. These are undirected, unweighted, simple-graph theorems, and my degrees are weighted and directed. But "is my degree sequence even graphic?" survives the translation intact, and it is a genuinely useful thing to ask before trusting a layer.

*Erdős & Gallai (1960), Mat. Lapok 11, 264–274. Erdős & Stone (1946), Bull. AMS 52, 1087–1091.*

## the Book

![The Book of Proofs, with an Erdős bookmark](/assets/ultragraph/book-of-proofs.png)

Erdős believed God kept a book. Not the moral ledger — a book of proofs, one perfect argument for every theorem, and the mathematician's whole job was to catch a glimpse. He was an atheist who found the whole God business dull, but The Book he took seriously. When a proof was clean enough to hurt, he'd say it was *straight from The Book*. It was the highest thing he could say about anything.

I have been circling two ideas this whole series without naming what they share. The probabilistic method proves a thing exists by showing a random object has it *on average* — you never build the object, you just trust the average. Straight-through estimation trains a 1-bit net by lying about the gradient — you round to $\{-1,0,+1\}$ on the way forward and pretend you didn't on the way back, and trust that the mistake washes out. Same faith, two costumes. Random graphs and ternary nets both live on the belief that "on average" is load-bearing, that you can skip the honest step and the sum still lands.

Let me be plain: ultragraph is a toy. None of this is a theorem about trained networks — the analogies are analogies, and I'd fight anyone who cited me as proof of anything. But setting three-valued weights next to $G(n,p)$ is not a stretch, whatever the pedants say. Sparsity is one knob. Erdős spent a career on what one knob does to a graph — where the giant component wakes up, where the last isolated vertex dies, where structure appears out of nothing at a threshold you can write down. If you have exactly one dial, you could do worse than learn from the man who owned that dial. The homage is sincere. A graph library should know whose shoulders it is standing on, and say the name out loud.

The proofs are in the reading list: [docs/references.md](https://github.com/peterlodri-sec/ultra-graph/blob/main/docs/references.md). Go teach the live one — [1-bit LLM mesh](https://huggingface.co/spaces/PeetPedro/1bit-llm-mesh).

[ultra-graph](https://github.com/peterlodri-sec/ultra-graph) · [❤ sponsor](https://github.com/sponsors/peterlodri-sec) · [X](https://x.com/0xp3t3rl) · [protocol](https://protocol.vaked.dev) · [chat](https://chat.vaked.dev)

Genesis `251e6ea`. Three values, one knob, and a career's worth of theorems about what it does.
