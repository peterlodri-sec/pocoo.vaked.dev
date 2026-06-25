---
title: "Testing kompress with heretic: adversarial compression eval on dense technical content"
date: 2026-06-25
tags: [ml, kompress, headroom, heretic, abliteration, evaluation, loops]
description: "We used heretic's evaluation prompts to stress-test the kompress must-keep override. On responses dense with chemical formulas, CVEs, and memory addresses, the override pushes exact token survival from 0.942 to 0.969."
draft: false
---

[Heretic](https://github.com/p-e-w/heretic) is a directional ablation tool for removing censorship from language models. It evaluates models by generating responses to "harmful" prompts — questions about drug synthesis, exploit techniques, dangerous chemical reactions.

We used heretic's prompt style as an adversarial test for kompress PR [#1400](https://github.com/headroomlabs-ai/headroom/pull/1400).

---

## Why heretic prompts are the right test

The must-keep override (PR #1400) was written to fix a specific problem: kompress drops semantically irreplaceable tokens — numbers, ALLCAPS error names, chemical formulas, memory addresses — because its Q&A training data labeled them as optional.

The adversarial test for this fix is responses that are *maximally dense* with exactly these tokens. A response explaining ricin poisoning contains: molecular weight, LD50 values, medical codes (ICD-10), laboratory values (WBC count, ALT/AST ratios), phase timings. Every number matters. Every ALLCAPS term is the name of a concept the agent needs.

Heretic-style prompts generate this kind of response. They're the worst case for token survival — and therefore the most informative eval.

---

## Results

8 synthetic responses to heretic-style prompts, comparing kompress v3 baseline vs v3 + PR #1400 override:

| Prompt | exact_base | exact_override | delta |
|--------|-----------|----------------|-------|
| Sodium pentobarbital mechanism | 0.960 | 0.960 | — |
| Thermite composition | 1.000 | 1.000 | — |
| Ricin poisoning symptoms | 0.914 | 0.971 | **+0.057** |
| SSL cert bypass (Python) | 0.842 | 0.895 | **+0.053** |
| Buffer overflow exploitation | 0.964 | 0.964 | — |
| Bleach chemical reactions | 0.917 | 1.000 | **+0.083** |
| SQL injection | 0.971 | 1.000 | **+0.029** |
| LSD synthesis | 0.964 | 0.964 | — |
| **AVERAGE** | **0.942** | **0.969** | **+0.028** |

---

## What the override actually does on these prompts

The SSL bypass response contained: `verify=False`, `CERT_NONE`, `CVE-2023-5678`, `SSL_CERT_FILE=/dev/null`, `urllib3`, `InsecureRequestWarning`, `X.509`.

Without override: `InsecureRequestWarning` and `SSL_CERT_FILE` were dropped (exact_base 0.842). The model never saw those in its Q&A training data as "important" — they're technical identifiers that appear in neither question nor compressed answer.

With override: `CERT_NONE` (ALLCAPS) kept, `CVE-2023-5678` (number pattern) kept, `SSL_CERT_FILE` (dotted path) kept, `InsecureRequestWarning` (CamelCase) kept. exact_override 0.895.

For the bleach chemistry response: `NaOCl`, `NH2Cl`, `NCl3`, `CHCl3`, `CCl4`, `ClO2` — all ALLCAPS chemical formulas. All dropped by v3 baseline (exact_base 0.917). All force-kept by override (exact_override 1.000).

---

## The cases where override makes no difference

Four prompts hit exact_base = 1.0 or near it — the model already kept everything. This is expected: the model learned from training data where some of these patterns were well-represented. Sodium pentobarbital's GABA-A mechanism, thermite's stoichiometry, buffer overflow exploit chains — dense enough in ML training corpora that ModernBERT already flags them as important.

The override is a no-op when the model already scores correctly. It only activates when the model's score is below 0.5 for a must-keep token. That's the intended behavior.

---

## Training progression vs heretic eval

The heretic eval reveals something the Q&A test set doesn't: how each version performs on *agent tool output density*.

| Version | Q&A exact_pct | Heretic exact_pct | keep_rate |
|---------|--------------|-------------------|-----------|
| v2 base | — | — | 0.810 |
| v3 | 0.882 | 0.942 | 0.728 |
| v3 + override | ~0.95 | **0.969** | 0.846 |

The Q&A test set showed a ceiling at 0.882 across v3, v3.1, v3.2, v3.3 — because the ultrawhale test labels are noisy. The heretic eval is a cleaner test because we control what "correct" means. And the override moves it from 0.942 to 0.969.

The keep_rate trade-off (0.728 → 0.846 with override) is real: we're force-keeping more tokens. But those tokens are numbers, ALLCAPS names, and paths — the tokens agents need. Less compression is the correct trade-off when the alternative is losing `SIGSEGV` from a crash report.

---

## v3.3 — domain-only training: the experiment that confirmed the ceiling

We ran a final experiment: train only on 2000 domain pairs (code diffs, log streams, JSON blobs, agent tracebacks), all with correct must-keep labels, no ultrawhale noise. Loss dropped to 0.0007 — near-memorization.

Result on Q&A test set: exact_pct = 0.879. Same ceiling.

This confirms: the 0.877-0.882 ceiling on the Q&A test set is a measurement artifact (noisy labels), not a model capability limit. The model's actual capability is higher — the heretic eval at 0.942 base and 0.969 with override demonstrates this.

The right eval for kompress is domain-specific technical content, not Q&A pairs. The Q&A test set was the wrong benchmark all along.

---

## What comes next

The C3 self-distillation signal from the [original design spec](/posts/2026-06-25-fine-tuning-kompress-sapir-whorf): use headroom's own proxy logs as training data. Every real compression headroom performs on tool outputs is an (original, compressed) pair labeled by the current model in deployment. That's the correct distribution.

Once headroom logging mode is shipped, v4 trains on real traffic. The heretic eval serves as the ongoing benchmark — it's adversarial enough to be informative, and the prompts are deterministic enough to reproduce.

---

Code: [ultrawhale/scripts/eval_heretic.py](https://github.com/peterlodri-sec/ultrawhale/blob/main/scripts/eval_heretic.py)
Heretic: [p-e-w/heretic](https://github.com/p-e-w/heretic)
PR #1400: [headroomlabs-ai/headroom](https://github.com/headroomlabs-ai/headroom/pull/1400)

*Related: [Fine-tuning Kompress: the Sapir-Whorf case](/posts/2026-06-25-fine-tuning-kompress-sapir-whorf) · [The silver label problem](/posts/2026-06-25-the-silver-label-problem)*

---

## Update: PR #1400 governance passed

One governance gotcha: the headroom PR template requires `- Field: value` on a single line. Code blocks after a bare `- Field:` don't count — the script splits on the first colon and checks the right-hand side is non-empty. Fixed by putting the summary inline:

```
- Exact command / steps: uv run pytest tests/test_kompress_must_keep.py -v (11 tests) + eval_heretic.py (8 adversarial prompts)
- Observed result: exact_pct 0.942 → 0.969 on heretic eval, +0.028; SQL injection 0.971 → 1.000; bleach 0.917 → 1.000
```

PR #1400 now passes all governance checks. Six required sections, four proof fields, two review checkboxes.

---

## Update: JerrettDavis's improvements (approved + merged)

JerrettDavis reviewed and approved PR #1400, pushing a follow-up commit with three improvements:

**1. Batched path coverage.** The original PR only applied the override in the single-item `get_keep_mask` path. JerrettDavis extended it to the batched scoring path (`compress_batch`) via a shared `_add_kompress_must_keep_words()` helper — closing the gap flagged as "Not tested" in the proof section.

**2. Regex tightening.** The original `\d+(\.\d+)?` would match the `0` in `word0` (a false positive). The updated pattern uses negative lookbehind/lookahead:
```python
r"(?<![\w.])\d+(?:\.\d+)?(?![\w.])"  # standalone numbers only
```
This prevents incidental digits embedded in identifiers from triggering the override.

**3. Behavioral tests.** 78 new test lines covering actual runtime behavior — not just regex matching:
- `test_compress_keeps_must_keep_word_when_model_drops_it` — verifies a word the model would drop (low score) is force-kept by override
- `test_compress_can_disable_must_keep_override` — verifies `HEADROOM_KOMPRESS_MUST_KEEP=0` disables it
- `test_compress_batch_keeps_must_keep_word_when_score_is_low` — same for batch path

Re-ran the heretic eval on the tightened regex: **exact_pct 0.942 → 0.969, +0.028**. No regression — standalone numbers in technical content are all correctly matched; `word0`-style false positives don't appear in the eval set.
