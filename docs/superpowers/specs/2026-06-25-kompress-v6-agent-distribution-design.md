# Kompress v6: Closing the Training-Production Gap

**Date:** 2026-06-25
**Budget:** ~$0.35 training + 2-3 iteration runs if needed (~$5.00 total)
**Outcome:** better real-world compression on Claude Code traffic + publishable blog post

---

## Problem

Kompress (ModernBERT 149M, token classifier) was trained on generic NLP text (alpaca_gpt4, Q&A pairs). In production it compresses Claude Code tool outputs: bash results, file reads, JSON from MCP tools, error traces, grep/find output.

The training-production distribution gap is the bottleneck. v4 heretic=0.967 but proxy stats show 717/736 requests prefix-frozen — when compression does fire, the model encounters patterns it was never trained on.

**Goal:** Train kompress-v6 on data that matches actual Claude Code output patterns (B: better real-world compression) across all content types (C: generalization), then write an e2e blog post for a broad technical audience.

---

## Approach: Synthetic training + real validation

Three-phase experiment:

1. Generate synthetic agent-pattern training data (CPU, free)
2. Self-label + train v6 on vast.ai (~$0.20-0.30)
3. Validate on real headroom proxy traffic (two eval modes)

---

## Phase 1: Synthetic data generation

### New domains (extend `build_domain_data.py`)

Five Claude Code-specific generators, ~600 examples each = 3k new pairs:

| Domain | Content pattern | Must-keep density |
|---|---|---|
| `bash_output` | `ls -la`, `find`, `grep`, `git log`, `cargo build` output | High — paths, flags, numbers |
| `file_read` | Python/TS/Rust source with line numbers, imports | Very high — identifiers, symbols |
| `json_tool_result` | Structured JSON from MCP/tool calls | High — keys, values, nested objects |
| `error_trace` | Stack traces, compile errors, test failures | High — paths, line numbers, symbols |
| `search_result` | ripgrep/find listings with sizes, dates, permissions | High — paths, numbers |

**Reference construction invariant** (same as existing domain data): all tokens matching `_MUST_KEEP_RE` (numbers, ALLCAPS, CamelCase, paths, flags) are always preserved in the reference. No LLM required. Deterministic, reproducible by any reader.

**Output:** `data/kompress_agent_train.jsonl` (3k pairs, no self-labeling yet)

### Training mix

Merge with existing `kompress_multi_train.jsonl` (2003 examples):
- 3k agent-pattern synthetic + 2k existing = 5k total
- ~60/40 split agent/generic
- File: `data/kompress_v6_train.jsonl`

---

## Phase 2: Self-labeling + training

### Self-labeling

Run v4+override on all 3k synthetic pairs to set `reference = v4_compressed_output`. Same procedure as v4 training. This propagates v4's internalized override behavior into the new domain data.

Skip self-labeling on existing 2003 pairs (already self-labeled for v4).

### Training

```bash
# new script: scripts/run_training_v6.sh
BASE_MODEL: PeetPedro/kompress-v4   # not v2-base — preserve override internalization
EPOCHS: 3                            # same as v4, avoid overfit
OUTPUT: PeetPedro/kompress-v6
DATA: data/kompress_v6_train.jsonl
```

Estimated cost: ~$0.20/run on RTX 4090 via `vast_relaunch.sh`.

**Decision rule:** if heretic exact_pct < 0.967 (regression), check domain weighting. If heretic ≥ 0.967 AND real proxy improves, ship. Budget for 2-3 runs.

---

## Phase 3: Real-world eval

### Baseline capture (pre-training, v4)

Run one focused Claude Code session (file edits, bash commands, tool calls) through headroom proxy. Capture `/stats` — tokens_saved, compression_pct, per-strategy breakdown.

### Two eval modes

**Mode A — Normal deployment** (prefix freeze on, port 8787):
- Mirrors real production behavior
- Shows deployment-level impact
- Expected: low overall compression rate (most traffic prefix-frozen)

**Mode B — Compression quality** (prefix freeze off, port 8788):
```bash
headroom proxy --no-prefix-freeze --port 8788
```
- Forces every message through compression pipeline
- Isolates model quality from caching behavior
- Apples-to-apples v4 vs v6 comparison

### Swap and re-measure

1. Set kompress model = v4, run sessions A+B, capture stats
2. Set kompress model = v6, run same sessions A+B, capture stats
3. Delta = improvement

### Metrics

| Metric | Source | Target |
|---|---|---|
| Heretic exact_pct | `eval_heretic.py` | ≥ 0.967 (no regression) |
| Mode A avg compression % | headroom `/stats` | > v4 baseline |
| Mode B avg compression % | headroom `/stats` | > v4 baseline (primary proof) |
| Mode B tokens_saved/request | headroom `/stats` | > v4 baseline |

Results published honestly regardless of direction. Flat or negative results = "the synthetic gap is real" and is itself the blog finding.

---

## Blog post

**Title:** "Closing the Training-Production Gap in Token Compression"
**Target:** ~1500 words, HN-friendly, broad technical audience
**Published to:** pocoo.vaked.dev (existing Astro blog)

### Structure

```
1. The problem (200w)
   - Kompress trained on NLP, deployed on bash output
   - Concrete example: grep output vs alpaca training pair
   - The gap quantified

2. What Claude Code actually produces (200w)
   - Headroom proxy domain stats from real traffic
   - 5 content categories with examples
   - Must-keep token density comparison: agent vs NLP

3. Synthetic data that matches production (300w)
   - Generator approach — no LLM, deterministic, reproducible
   - Self-labeling: v4+override as the teacher
   - Code snippet: one generator function (bash_output domain)
   - Training: fine-tune from v4, 5k pairs, $0.20

4. Results (400w)
   - Heretic: v4 0.967 → v6 X
   - Mode A (real deployment): before/after
   - Mode B (no-prefix-freeze): isolated model quality
   - Loss curve plot
   - Honest framing if delta is small

5. What's next (200w)
   - Domain routing thresholds (free, no training needed)
   - C3: what real proxy data would add on top of synthetic
   - The flywheel: better model → better proxy → better data
```

---

## Implementation order

1. `scripts/build_domain_data.py` — add 5 new generators
2. `data/kompress_agent_train.jsonl` — generate 3k pairs
3. `scripts/run_training_v6.sh` — self-label + train from v4
4. Eval: heretic + Mode A/B proxy measurement
5. Blog post (written from actual results)

---

## Risks

| Risk | Mitigation |
|---|---|
| prefix_frozen dominates Mode A, delta invisible | Mode B isolates model quality; report both |
| Synthetic data still too far from real distribution | Publish finding; Mode B proves/disproves |
| v6 regresses on heretic | 2 more runs with adjusted domain weighting |
| Blog is boring if result is flat | "synthetic gap persists" is publishable finding |

---

## Budget

| Item | Cost |
|---|---|
| v6 training run 1 | ~$0.20 |
| v6 training run 2 (if needed) | ~$0.20 |
| v6 training run 3 (if needed) | ~$0.20 |
| **Total experiment** | **~$0.35-0.60** |
| Remaining after experiment | ~$4.40-4.65 |
