---
title: "Closing the Training-Production Gap in Token Compression"
date: 2026-06-25
tags: [ml, kompress, headroom, fine-tuning, self-distillation, loops]
description: "We fine-tuned kompress on synthetic Claude Code patterns — bash output, file reads, stack traces — and measured what changed. The model got more conservative. Here's what that means."
draft: false
---

Kompress is a 149M parameter ModernBERT token classifier that decides which tokens to keep when compressing LLM context. It was trained on alpaca Q&A pairs. Its job is compressing Claude Code tool outputs.

These are different things.

---

## The gap

Here is a typical alpaca training pair:

```
text:      "What is the capital of France? The capital of France is Paris,
            a city renowned for its rich history and cultural heritage..."
reference: "Capital France Paris"
```

Here is what Claude Code actually produces when you run a grep:

```
src/auth/middleware.py:142:    if token.expires_at < datetime.now():
src/auth/middleware.py:156:        raise TokenExpiredError(f"token {token.id} expired at {token.expires_at}")
tests/test_auth.py:89:def test_token_expiry():
```

The alpaca reference drops "rich history and cultural heritage" — reasonable compression. But if kompress applies the same logic to the grep output and drops `TokenExpiredError` or `token.expires_at`, the compressed context is now factually wrong. The agent loses track of the exact error class and field name it needs to fix the bug.

Must-keep token density — numbers, ALLCAPS identifiers, CamelCase types, file paths, flags — is roughly 3x higher in agent tool output than in generic NLP text. The model was never trained on this distribution.

---

## What Claude Code actually produces

Proxy logs from a live headroom session show five dominant content types:

| Content type | Examples | Must-keep density |
|---|---|---|
| `bash_output` | `ls -la`, `find`, `grep`, `git log`, `cargo build` | High — paths, line numbers, flags |
| `file_read` | Python/TS/Rust source with line numbers | Very high — identifiers, imports |
| `error_trace` | Stack traces, compile errors | High — paths, line numbers, symbols |
| `search_result` | ripgrep/find listings | High — paths, sizes, counts |
| `json_tool_result` | MCP tool responses | High — keys, values, nested structure |

None of these categories appear in alpaca_gpt4.

---

## Closing the gap with synthetic data

We extended `build_domain_data.py` with five new generators — one per content type above. Each generator produces `(text, reference)` pairs where:

- `text` is a realistic agent tool output (paths, identifiers, numbers, flags)
- `reference` is the compressed version, with every `_MUST_KEEP_RE` token preserved

The invariant is verified exhaustively: 0 violations across 3,000 generated pairs, ratio ≥ 1.3 for every row.

Here is the bash_output generator's git log branch as a concrete example:

```python
def _make_bash_output(rng):
    hashv = rng.choice(_GIT_HASHES)   # "a3f2c91"
    camel = rng.choice(_CAMEL)        # "TokenExpiredError"
    mod   = rng.choice(_MODULES)      # "auth.middleware"
    num1  = rng.randint(1, 999999)
    num2  = rng.randint(100, 65536)

    text = (
        f"Showing git log output from the recent development work\n"
        f"{hashv} fix({mod.split('.')[0]}): resolve {camel} on retry path\n"
        f"{rng.choice(_GIT_HASHES)} chore: bump version to {num2%10}.{num1%100}.{num2%50}\n"
        f"Showing last {num1%20+1} commits on the main branch"
    )
    ref_lines = [
        f"{hashv} fix({mod.split('.')[0]}): {camel}",
        f"{rng.choice(_GIT_HASHES)} bump {num2%10}.{num1%100}.{num2%50}",
        f"last {num1%20+1} commits",
    ]
    return text, "\n".join(ref_lines)
```

Every must-keep token — the hash, the CamelCase error class, the version numbers, the commit count — appears in the reference. The prose filler gets dropped.

**No LLM needed.** Deterministic, seeded, reproducible by anyone.

### Training

We merged 3,000 new agent-pattern pairs with 2,003 existing generic pairs and fine-tuned from `PeetPedro/kompress-v4` (the current best model) for 3 epochs on a vast.ai RTX 4090. Cost: $0.20.

One thing we tried and abandoned: self-labeling the new data with v4. The idea was to let v4 re-compress the synthetic pairs and use its output as the training reference — the same technique that produced v4 from v3. It failed:

```
mk_in_ref: 0.652 (target >= 0.85)
ERROR: mk_in_ref 0.652 < 0.85, aborting
```

The reason: v4's tokenizer splits `TokenExpiredError` into `Token` + `Expired` + `Error`, and `/var/log/app.log` into `/` + `var` + `/` + `log` + `...`. The must-keep override checks individual subtokens, not full words. So it fails to force-keep the assembled path or CamelCase identifier. v4 drops them, mk_in_ref collapses.

The fix: skip self-labeling entirely for agent data. The synthetic generators already produce mk_in_ref=1.0 references by construction. Using v4's compressed output as the label would only degrade them.

---

## Results

### Heretic eval

Heretic score measures how well must-keep tokens survive compression on adversarially dense prompts (chemical formulas, CVE identifiers, memory addresses):

| Version | keep_rate | exact_pct | override_delta |
|---|---|---|---|
| v2-base | 0.897 | 0.975 | — |
| v4 | 0.823 | 0.967 | 0.000 |
| **v6** | **0.854** | **0.962** | **0.000** |

v6 scores 0.962, just above the convergence floor (>0.960). The override remains redundant. But the interesting number is `keep_rate`: it went from 0.823 (v4) to 0.854 (v6). The model got more conservative.

### Real proxy measurement

We compared v4 and v6 on the same Claude Code session (file reads, bash commands, grep, git log) routed through headroom proxy:

| | compressed requests | avg compression | tokens removed |
|---|---|---|---|
| v4 | 1/7 | 9.5% | 24,004 |
| v6 | 1/3 | 4.2% | 10,673 |

v6 compresses less aggressively — consistent with the higher keep_rate. On the one request that triggered compression in both runs, v4 removed 9.5% of tokens while v6 removed 4.2%.

Most traffic in Mode A was prefix-frozen (the CacheAligner locks prior turns to protect cache hits). To isolate model quality from caching, we ran Mode B with prefix freeze disabled. Mode B confirms the directional result: v6 is more conservative than v4 on agent content.

---

## What happened

Training on agent-pattern data shifted the model toward keeping more tokens on structured technical content. This was the intended direction — the old model was probably too aggressive on paths and identifiers — but the magnitude surprised us.

A few possible explanations:

1. **The synthetic references are conservative by design.** The generators preserve every must-keep token, producing references with high keep_rate. The model learned to match that distribution.

2. **No self-labeling means no compression pressure.** v4's training used v3-compressed references (ratio ≥ 1.2). v6's agent training used generator references at exactly the generator ratio — never pushing the model to be more aggressive.

3. **5k total pairs may not be enough to override the 149M parameter prior.** The existing 2,003 generic pairs from alpaca may be pulling the model toward their compression patterns, while the 3,000 agent pairs shift the distribution but don't dominate it.

---

## What's next

**Domain routing (free, no training).** Instead of one threshold for all content types, use per-domain thresholds: lower for structured output (code, logs, JSON where must-keep density is high), higher for prose. No retraining required.

**C3 self-distillation (real data).** Enable `log_full_messages: true` in headroom for one focused session, collect actual tool outputs, verify mk_in_ref on real messages, and train v7 on them. The synthetic generators approximate the distribution; real logs would close the remaining gap.

**Fix the self-labeling tokenizer mismatch.** The subword override failure is fixable: instead of checking individual subtokens, decode a sliding window of 2-3 tokens and check the combined string against `_MUST_KEEP_RE`. This would let us self-label agent data with v6 and potentially produce a more compression-aggressive v7 while maintaining must-keep coverage.

---

*Models: [PeetPedro/kompress-v4](https://huggingface.co/PeetPedro/kompress-v4) and [PeetPedro/kompress-v6](https://huggingface.co/PeetPedro/kompress-v6) on HuggingFace. Training code: [ultrawhale](https://github.com/peterlodri-sec/ultrawhale). Compression proxy: [headroom](https://github.com/headroomlabs-ai/headroom).*
