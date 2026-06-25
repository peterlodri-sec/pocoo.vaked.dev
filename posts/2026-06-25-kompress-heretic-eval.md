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

---

## Update: kompress-v6 — agent-distribution fine-tune

We trained v6 on 3,000 synthetic Claude Code agent-pattern pairs (bash output, file reads, stack traces, search results, JSON tool responses) merged with the existing 2,003 generic pairs. Fine-tuned from v4 weights for 3 epochs, ~$0.20 on a vast.ai RTX 4090.

Full heretic progression:

| Version | keep_rate | exact_pct | override_delta |
|---------|-----------|-----------|----------------|
| v2-base | 0.897 | 0.975 | — |
| v3 + override | 0.846 | 0.969 | +0.028 |
| v4 | 0.823 | 0.967 | 0.000 |
| **v6** | **0.854** | **0.962** | **0.000** |

The interesting result: v6 kept a *higher* proportion of tokens (keep_rate 0.823 → 0.854) while scoring 0.962 on heretic. Agent-pattern training made the model more conservative — it learned that structured technical output is dense with must-keep tokens and it should keep more of it.

Real proxy measurement on the same Claude Code session confirmed: v4 achieved 9.5% compression on the one request that triggered it; v6 achieved 4.2% on a comparable request. Less compression, but the direction is right: fewer must-keep tokens dropped on paths, identifiers, and error class names.

One unexpected finding from the training run: self-labeling agent data with v4+override failed (mk_in_ref collapsed to 0.652). The v4 subword tokenizer splits `TokenExpiredError` into `Token`+`Expired`+`Error` and `/var/log/app.log` into `/`+`var`+`/`+`log`+`...` — individual subtokens that don't match `_MUST_KEEP_RE`, so the force-keep never fires. Generator references (mk_in_ref=1.0 by construction) are better labels than v4-self-labeled ones for agent content.

The next step to fix this: slide a 2-3 subtoken window and check the decoded string against `_MUST_KEEP_RE` rather than individual subtokens. That would let self-labeling work on agent data and potentially produce a more compression-aggressive v7.

Model: [PeetPedro/kompress-v6](https://huggingface.co/PeetPedro/kompress-v6). Full write-up: [Closing the Training-Production Gap in Token Compression](/posts/2026-06-25-kompress-v6-agent-distribution).

---

## Update: kompress-v7 — sliding-window fix applied, direction closed

We implemented the sliding-window fix in v7: instead of checking individual subtokens, `compress_with_override` now decodes 1/2/3-token windows and checks the combined string. Test results: `TokenExpiredError`, `/var/log/app.log`, and `--verbose` all force-kept correctly (3/4 failed single-subtoken, 4/4 pass sliding-window).

v7 results were not an improvement:

| Version | keep_rate | exact_base | exact_override | override_delta |
|---------|-----------|------------|----------------|----------------|
| v4 | 0.823 | 0.967 | 0.967 | 0.000 |
| v6 | 0.854 | 0.962 | 0.962 | 0.000 |
| v7 | 0.868 | 0.949 | 0.956 | **+0.007** |

The override came back (+0.007) — the model no longer internalizes must-keep behavior without the explicit override. keep_rate climbed again to 0.868. The SSL bypass prompt regressed sharply: 0.789 (v6) → 0.684 (v7 base). The sliding-window self-labeling kept *more* tokens in the references, which trained the model to be even more conservative and lose precision on adversarial prompts.

**The agent-distribution fine-tuning direction is closed.** Three iterations (v5, v6, v7) all show the same pattern: more agent training increases keep_rate and decreases heretic precision. The models become more conservative but less accurate. v4 remains the production recommendation (heretic 0.967, override_delta=0).

The loop has learned: training on "keep more" references produces a model that keeps more — including the wrong tokens. Label quality matters not just in quantity but in specificity: a reference that aggressively drops prose while keeping all technical tokens is a better teacher than one that keeps everything technical by default.

Model: [PeetPedro/kompress-v7](https://huggingface.co/PeetPedro/kompress-v7).

---

## Update: domain routing — data-backed per-content-type thresholds

Rather than train another model, we ran `eval_domain_routing.py` on kompress-v4 across 5 agent content types (20 samples each, criterion: must-keep token survival ≥ 95%):

| Content type | Headroom ContentType | Optimal bias | Compression ratio | MK survival |
|---|---|---|---|---|
| Error/build traces | `BUILD_OUTPUT` | **0.50** | 2.15x | 96.8% |
| File reads | `SOURCE_CODE` | **0.50** | 1.99x | 96.8% |
| Search/grep output | `SEARCH_RESULTS` | **0.70** | 1.45x | 98.9% |
| Bash output | `PLAIN_TEXT` | 1.00 | 1.24x | 94.9% (below threshold) |
| JSON tool results | `JSON_ARRAY` | 1.50 | 1.09x | 95.6% |

The result was counterintuitive: error traces and file reads can compress 2x more aggressively than the current default, while JSON tool responses need more conservative treatment. Structured JSON keys and values that look unambiguous to humans are opaque to the model without context.

The implementation adds `_DOMAIN_BIAS_MULTIPLIERS` to headroom's `content_router.py` — a single dict lookup multiplied into the existing bias before `_compress_pure` is called. Tool profile overrides still take precedence. PR: [headroomlabs-ai/headroom#1418](https://github.com/headroomlabs-ai/headroom/pull/1418).

---

## Update: expanded benchmark — 32 prompts via Qwen2.5-7B

The original 8 prompts were too few to be reliable. We used Qwen2.5-7B (HuggingFace serverless inference) to generate 24 additional heretic-style adversarial prompts: CVE/CVSS scores, memory addresses, compiler flags, chemical formulas, protein mutations, radioisotopes, cryptographic constants.

Running all three current models on 32 prompts:

| Version | keep_rate | exact_pct (32) | exact_pct (8) | override_delta |
|---|---|---|---|---|
| v4 | 0.854 | 0.943 | 0.967 | 0.000 |
| v6 | 0.746 | 0.942 | 0.962 | 0.000 |
| v7 | 0.782 | **0.944** | 0.956 | +0.002 |

The 8-prompt gap was overstated. On 32 prompts all three models score within 0.002 of each other (~0.943). The benchmark was measuring noise, not real differences.

One genuine gap: the **compiler flags prompt scores 0.516 across all models** — `-O2`, `--march=native`, `-fPIC` are being dropped. Looking at `_MUST_KEEP_RE`: `--?[a-z][\w-]*` should match these. The issue is likely tokenization: `-O2` splits into `-`, `O`, `2` — none matching the full pattern. A sliding-window fix (like v7's) applied to the override would help, but v7 showed that aggressive sliding-window self-labeling regresses the model. The right fix is adding `[A-Z]\d+` to `_MUST_KEEP_RE` to catch compiler optimization flags like `-O2`, `-O3`, `-Os`.

Eval script now accepts `--prompts-file` for custom JSONL: `python3 scripts/eval_heretic.py --model X --prompts-file data/heretic_expanded.jsonl`. New standard: exact_pct > 0.940 on 32 prompts, override_delta = 0.000.

---

## Update (2026-06-25, later): fixing the compiler flag gap — in production, not training

After publishing this post, we traced the compiler flag gap to its root cause and implemented the fix. The answer turned out to be different than expected.

### The tokenizer is the bottleneck

The ModernBERT subword tokenizer splits critical patterns across multiple tokens:

| Pattern | Tokenization | Model scores on subwords |
|---|---|---|
| `-O2` | `-`, `O`, `2` | `O`=0.5, `2`=0.8 — no single token matches the full pattern |
| `Cargo.toml` | `C`, `argo`, `.`, `tom`, `l` | `argo`=0.000, `tom`=0.003 — pure information loss |
| `TokenExpiredError` | `Token`, `Expired`, `Error` | all ≥0.9 — survives, but fragile |
| `/var/log/app.log` | `/`, `var`, `/`, `log`, `app`, `.`, `log` | `log`=0.187 in one context — dropped |

The single-token ML classifier can't recognize `argo` as part of `Cargo` or `tom` as part of `.toml`. This isn't a model quality problem — it's a fundamental tokenization mismatch between how the model sees text (subword tokens) and what humans consider atomic (words, flags, paths).

### The v7 dead end

v7 tried to fix this by *training* the model with sliding-window self-labeling — labeling `--verbose` across its 3 subword tokens as "keep all three." The fix worked mechanically: `TokenExpiredError`, `/var/log`, and `--verbose` all passed individual tests. But the model became more conservative across the board (keep_rate 0.823 → 0.868) and regressed on heretic precision (0.967 → 0.956). Training the model to do what regex can do perfectly is the wrong approach.

### The production fix: regex safety net

Instead of retraining, we added a **post-inference regex safety net** directly in the headroom kompress compressor (PR [#1419](https://github.com/headroomlabs-ai/headroom/pull/1419)). After the ML model makes keep/drop decisions, a sliding window of 1–3 words checks each dropped word against a must-keep regex:

```
0xDEADBEEF          → hex addresses
-O2, --verbose      → compiler flags  
/var/log/app.log    → file paths
HEADROOM_FOO        → ALLCAPS env vars
TokenExpiredError   → CamelCase identifiers
Cargo.toml          → dotted names
.py, .rs, .log      → file extensions
```

If a window matches, every word in it is force-kept. The regex is `_MUST_KEEP_RE` — the same pattern used in the heretic eval calibration harness.

### Results: 96.2% must-keep survival on agent data

We built an **evaluator-optimizer** (script: `scripts/evaluator_optimizer.py`) that runs v4 self-labeling on real agent tool outputs and measures how many must-keep patterns survive. Qwen2.5-7B-Instruct acts as a "teacher" — when v4 misses patterns, Qwen identifies what was lost and why.

On 50 samples from `kompress_agent_train.jsonl` (bash output, file reads, search results, JSON tool output, error traces):

| Metric | Without override | With override |
|---|---|---|
| mk_in_ref survival | 0.652 | **0.962** |
| Failing pairs (mk < 0.9) | ~all | 3 of 50 |

The 3 remaining failures are edge cases: multi-dot version numbers (`3.28.33`), `=`-separated values (`timeout=123`), and rare error names that don't match the CamelCase pattern. These can be addressed with regex refinements — no model retraining needed.

### Why production regex beats training

This is the central insight of the session:

- **v4 + regex override**: heretic 0.967, agent mk_in_ref 0.962
- **v7 (trained sliding window)**: heretic 0.956, agent mk_in_ref ~0.87

Training the model to handle tokenization artifacts makes it *more conservative everywhere*, not smarter. The model starts second-guessing its own decisions on tokens that were correctly dropped, increasing keep_rate and decreasing adversarial precision. Regex post-processing is surgical: it catches exactly the patterns it's supposed to, leaves everything else alone, and preserves the model's hard-won precision.

### What ships

Two PRs against headroom, designed to land together:

1. **[#1418](https://github.com/headroomlabs-ai/headroom/pull/1418) — Domain routing**: per-content-type bias multipliers (BUILD_OUTPUT 0.50, SOURCE_CODE 0.50, SEARCH_RESULTS 0.70). 2x compression on code/logs, 1.45x on search. Calibrated WITH the must-keep override active.

2. **[#1419](https://github.com/headroomlabs-ai/headroom/pull/1419) — Must-keep override**: the regex safety net described above. Default on, controlled by `KompressConfig.enable_must_keep_override`. All 81 existing tests pass.

Both changes are in production code. No GPU, no retraining, no model uploads. Just a regex and a bias multiplier.


---

*The loop pattern that produced these models is now open source: [LoopKit — your loop engineering starter kit](/posts/2026-06-25-loopkit).*