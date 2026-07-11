---
title: "Hungarian history as an ultra-graph"
date: 2026-07-11T22:00:00
tags: [ultragraph, byte-graph, knowledge-graph, hungarian, history, anonymus, ternary]
description: "The whole arc of Hungarian history — from Scythia and the seven chieftains to Trianon, 1956, and the EU — encoded as a single ultra-graph: each era a sparse Tree of people, events, and places, wired chronologically by ultra-edges (===), with a few thematic residual links across the centuries. Built on the same byte-graph library that is the 1-bit Anonymus LLM."
image: assets/anonymus/og-anonymus.png
---

Having trained [a 1-bit language model on Anonymus](2026-07-11-first-1bit-hungarian-llm-anonymus.html), I had the *Gesta Hungarorum* on the brain — the origin story, Álmos and Árpád and the seven chieftains coming out of Scythia. And the library I built it on, [ultragraph](https://github.com/peterlodri-sec/ultra-graph), is not really an ML library; it is a *graph* library that happens to be able to be a language model. So the obvious next move: stop training on Hungarian history and just **draw** it — the whole arc, as one graph, in the byte-graph data model itself.

![Magyar történelem — the whole arc of Hungarian history as one ultra-graph](/assets/hungarian/history.svg)

## history is a graph, so store it as one

The ultragraph data model has exactly the three levels history wants:

- a **node** is one byte — here, one person, event, or place;
- a **tree** is a whole sub-graph — here, one **era**;
- an **ultra-edge** (`===`) wires trees together — here, the arrow of time.

So each era of Hungarian history is a sparse `Tree`. Its nodes are the people, events, and places that matter — `Álmos`, `Mohács 1526`, `Vereckei-hágó` — carried with their labels and years in the tree's **ad-hoc side store** (the byte-graph keeps one byte per node for the machine; the ad-hoc store keeps the human-readable extra data). Within an era, **micro-edges** wire the relations: *father of*, *defeats*, *leads to*, *crowned*. Between eras, **ultra-edges** wire the chronology — `Origins >> Conquest >> Raids >> Founding >> …` — one arrow per turn of the age.

```python
ug = UltraGraph("hungarian_history")
trees = []
for key, span, nodes, edges in ERAS:
    t = Tree(len(nodes), name=key)
    t.adhoc["labels"] = nodes          # the ad-hoc side store: people / events / places
    for a, b, rel in edges:
        t.add_edge(a, b, 1)            # a micro-edge — one byte — inside the era
        t.adhoc["rels"][(a, b)] = rel
    ug.add(t); trees.append(t)
for prev, cur in zip(trees, trees[1:]):
    prev >> cur                        # ultra-edge (===) — the arrow of time
```

The result is one `UltraGraph`: **13 era-trees, 59 nodes, 45 micro-edges, 15 ultra-edges**. The whole of Hungarian history, from before 895 to the EU, as a single byte-graph you can hold in one object.

## the residual links

Chronology is the backbone, but history rhymes, so a few ultra-edges are typed **`residual`** instead of `plain` — the dashed purple brackets on the left of the diagram. They carry a signal *across* the centuries rather than step to step:

- **Origins → Founding**: the Árpád line that Anonymus traces from Álmos is the same line that puts the crown on Saint Stephen in the year 1000.
- **Conquest → Árpád dynasty**: the land taken in 895 becomes the kingdom that holds it for four hundred years.
- **Hunyadi → Ottoman**: the Hunyadis' victory at Nándorfehérvár in 1456 buys the seventy years that end at Mohács in 1526.

Residual edges are the same primitive the transformer blocks use to carry a signal past a layer. Here they carry it past a century. Same `===`, longer reach.

## the same substrate as the LLM

This is the part I find quietly satisfying. The **Origins** era at the top of the graph — Scythia, Levédia, Etelköz, Ügek, Álmos, the *hetumoger* — is exactly the material of the *Gesta Hungarorum*, the text the [1-bit Anonymus LLM](2026-07-11-first-1bit-hungarian-llm-anonymus.html) was trained on. The graph and the language model are two readings of the same byte-graph substrate: one stores history as nodes and typed edges you can see; the other compresses a chronicle of it into ternary weights you can run. Node, edge, tree, ultra-edge — it renders a timeline or it writes medieval Latin, depending on which way you squint.

The graph here is **semi-static** — hand-curated, not learned. That is the honest label: it is a knowledge graph, a scaffold, the kind of thing you would hand to a model as ground truth rather than ask it to hallucinate. The interesting future is wiring the two together — the learned model reading and extending the curated graph — but that is a later post.

## reproduce

```sh
pip install ultragraph-1bit
uv run python examples/hungarian_history.py
# -> examples/data/hungarian_history.svg (this timeline)
#    examples/data/hungarian_history_macro.svg (the library's own ultra-graph view)
```

The renderer is ~120 lines of pure Python emitting SVG — no dependencies beyond the
library. Fork it, add your own eras, or point it at a different nation's arc; the data
model does not care whose history it is.

## Further reading

- [ultragraph on GitHub](https://github.com/peterlodri-sec/ultra-graph) — the byte-graph library. The history graph is `examples/hungarian_history.py`.
- [The first 1-bit Hungarian LLM](2026-07-11-first-1bit-hungarian-llm-anonymus.html) — a ternary GPT trained on Anonymus, the source of the Origins era.
- [anonymus-1bit-gpt on Hugging Face](https://huggingface.co/PeetPedro/anonymus-1bit-gpt) — the trained 196 KB model.
- [ultragraph — when the graph is the 1-bit LLM (part 1)](2026-07-10-ultragraph-the-graph-is-the-llm.html) — node = byte, edge = trit, tree = net, `===` = ultra-edge.
