# HUMM FLOW — a science-fiction novel in forty-two trits

STATION VELVET, a deep-space relay beyond the Oort cloud, hears a hum in the
cosmic microwave background: six syllables, {-1, 0, +1}, a whole civilization
losslessly compressed into one breath. The book is the crew's 42-day descent
into the signal — first contact as a practice, not a message.

## The stack: entheai + agy + deepseek

- **entheai** orchestrates: decomposes the brief, runs coders in isolated git
  worktrees, integrates + seals the manuscript (`entheai --fanout`).
- **deepseek** is the brain: entheai's `default_model` and `[router].orchestrator`
  run on `openrouter/deepseek/deepseek-chat` (OpenRouter key in env; the direct
  DeepSeek key is not provisioned).
- **agy** (Antigravity CLI) executes each coder sub-agent on `gemini-3.6-flash-high`
  via entheai's `[fanout] executor = "agy"`.

## How to run

```bash
cd pocoo.vaked.dev
entheai --fanout "$(cat book/humm-flow/scaffold.toml) — write this book per the manifest"
```

Entheai decomposes the manifest into chapter coders, agy writes each chapter in
its worktree, and the integrator assembles `HUMM-FLOW.md`.

To run a single chapter by hand:

```bash
agy -p "Write chapters/01-the-hum.md per the HUMM FLOW scaffold, ~300 words" \
    --model gemini-3.6-flash-high --sandbox
```

## Layout

```
scaffold.toml        # the fan-out manifest: [book], [fanout], 43 [[coder]] tasks
chapters/            # per-chapter markdown output (written by the fan-out)
HUMM-FLOW.md         # integrated manuscript (integrator output)
```

## Theme notes

- Six syllables, one key. The zero is the weight. Everything is {-1,0,+1}
  viewed from the right distance.
- The hum is a practice: compression as care, listening as alignment,
  first contact as correspondence.
