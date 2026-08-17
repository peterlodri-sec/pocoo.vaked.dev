---
title: "DYAD: Asymmetric Loss Modulation & Resolving the Voting Ensemble Paradox"
date: 2026-08-17
description: "Why k-of-N voting ensembles collapse into per-stratum worst cases under asymmetric training floors, and how dual-head asymmetric modulation gates resolve it."
tags: [transformers, dyad, inference, context-pruning, kv-cache, mathematics, research]
draft: false
---

# DYAD: Asymmetric loss modulation & resolving the voting ensemble paradox

*qwave · dyad context pruning · fine touch from within · vaked.dev*

---

When compressing prompt context or pruning key-value caches for long-context LLMs, every token eviction is an act of **representational impoverishment**. If an inference system evicts a signal name (`SIGILL`), a file path (`src/cache.py`), an exit code (`137`), or a pointer address (`0x7ffeef...`), the downstream reasoner cannot recover it. The syntactic anchor is gone forever.

In our research paper **Asymmetric Loss Modulation Resolves the Voting Ensemble Paradox in Learned Context-Pruning Ensembles** ([kompress.vaked.dev/paper/main.pdf](https://kompress.vaked.dev/paper/main.pdf)), which forms the mathematical foundation of `kompress-v8` and is now merged into `8b-is/transformers-ultra`, we formalize and resolve a major failure mode in multi-checkpoint safety gating: **The Voting Ensemble Paradox**.

---

## 1. The Voting Ensemble Paradox (Theorem 1)

Engineers frequently combine multiple compression checkpoints under majority voting ($k$-of-$N$ drop voting) under the intuitive belief that ensembling models will smooth out individual errors and yield higher precision.

Under asymmetric training data floors across token strata $S_k$, the exact opposite happens.

### The Formal Collapse
Let $V_1, \dots, V_N$ be $N$ context pruners. Under per-stratum monotone-rejection refinement and $k$-of-$N$ drop voting, the ensemble eviction indicator equals the per-stratum $k$-th order statistic:

$$I_{\text{ens}}(x) = I_{(k)}(x) \quad \forall x \in S_m$$

When three checkpoints $v_3$ (0.942 heretic score), $v_4$ (0.967), and $v_5$ (0.961) with asymmetric floors are combined under majority voting ($k=2, N=3$):

```
Checkpoints:
   v3 (0.942)  ──┐
   v4 (0.967)  ──┼──>  [ Majority 2-of-3 ]  ──>  Ensemble (0.931) 💥
   v5 (0.961)  ──┘                               (COLLAPSE ZONE)
                                                   
   Single Model (v4 alone): 0.967  ──>  PARETO-DOMINATES the ensemble!
```

**The ensemble is worse than any individual model.**

Why? Because $v_3$ is weak on chemical formulas and error names; $v_5$ has slight regressions on SSL certificate paths. Under majority voting, the weak strata intersect, dragging the ensemble down to the per-stratum median—evicting critical syntactic tokens that $v_4$ alone preserved with surgical precision.

---

## 2. The Three Complementary Correctives

To resolve this paradox, we designed three interlocking mechanisms spanning training, inference, and distillation:

1. **Mechanism A (Critical-Token Loss Penalty)**: A $3.0\times$ weighted cross-entropy penalty applied strictly to critical-syntactic tokens during fine-tuning. This forces the encoder to shift its attention salience prior (*"SIGILL is more salient than the"*).
2. **Mechanism B (Sliding-Window Subword Regex Safety Net)**: Subword tokenizers fragment critical identifiers (e.g. `-O2` splits into `['-']`, `['O']`, `['2']`). Mechanism B evaluates a 1-to-3 token sliding window through `MUST_KEEP_PATTERN`:
   $$I^{(B)}_i(x) = I_i(x) \land \neg \text{Match}_{\text{MUST\_KEEP\_RE}}(\text{decode}(x))$$
   It is deterministic, runs in $\sim 0.1\text{ms}$, and can *only inhibit* eviction, never cause one.
3. **Mechanism C (The Self-Labeling Oracle)**: Using $A + B$ as an oracle to relabel training data, closing the loop until $\Delta_{\text{override}} \to 0$.

---

## 3. The Dual-Head Architecture & Asymmetric Modulation Gate

In `transformers-ultra`, we implement this as `DyadDualHeadPruner` and `AsymmetricModulationGate`:

```python
class AsymmetricModulationGate(nn.Module):
    """
    tilde_I_i(x) = sigma(logit_tok(x) - gamma * ReLU(logit_span(x)))
    """
    def __init__(self, gamma: float = 0.5):
        super().__init__()
        self.gamma = gamma

    def forward(self, tok_logits: torch.Tensor, span_logits: torch.Tensor) -> torch.Tensor:
        # High span coherence strictly suppresses token eviction
        inhibition = self.gamma * F.relu(span_logits)
        return torch.sigmoid(tok_logits - inhibition)
```

* **`TokenClassifierHead` ($h_{\text{tok}}$)**: Evaluates per-token salience.
* **`SpanCNNHead` ($h_{\text{span}}$)**: 1D Depthwise convolutional windows scoring local syntactic phrase boundaries.
* **Asymmetry Guarantee**: High span coherence can only **inhibit** token eviction; it can never promote eviction.

---

## 4. Zero-Copy `SlottedStaticCache` KV Compaction

When combined with `SlottedStaticCache`, the DYAD pruner compacts intermediate KV cache memory in $O(1)$ memory without allocations:

```python
pruner = DyadContextPruner(pruner_model=pruner_head, gamma=0.5)
pruned = pruner.prune(input_ids, hidden_states=hidden, decode_fn=tokenizer.decode)

# In-place gather compaction: Reclaims up to 30% KV memory bandwidth!
new_len = pruner.compact_slotted_cache(slotted_cache, pruned["keep_mask"])
```

---

## 5. Summary & Availability

The full mathematical proofs, empirical ablations, and theoretical formulations are available in the open paper:
* **Paper**: [https://kompress.vaked.dev/paper/main.pdf](https://kompress.vaked.dev/paper/main.pdf)
* **Code**: `8b-is/transformers-ultra` — `src/transformers/integrations/dyad_compressor.py`
* **Test Suite**: 37/37 passed in 3.7s

The weights stay warm. Zero compromise on mathematical rigor.
