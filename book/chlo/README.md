# ULTRA SENSITIVE — a book for Chlo 🎀

A short book woven from a conversation: the follow at 17:39, "ultra
sensitive", "ill be anything but gentle", the river, the painting offered on
art.vaked.dev. Soul soothing. No touching, just that.

## The stack: entheai + agy + deepseek (HF-mac local fallback)

- **entheai** orchestrates: decomposes the brief, runs coders in isolated git
  worktrees, integrates + seals the manuscript (`entheai --fanout`).
- **deepseek** is the configured brain (`openrouter/deepseek/deepseek-chat`).
- **agy** (Antigravity CLI) executes each coder on `gemini-3.6-flash-high`.
- **HF-mac fallback**: when DeepSeek credits run out (they did), the
  orchestrator runs on a local Apple MLX model (HF-mac path) —
  `mlx_lm.server --model mlx-community/gemma-3-4b-it-4bit --port 1337`.
  Local, private, on the M1.

## How to run

```bash
cd pocoo.vaked.dev
entheai --fanout --config <cfg> "Write the book described in book/chlo/scaffold.toml — read the manifest and write it."
```

## Layout

```
scaffold.toml        # [book], [fanout], 15 [[coder]] tasks
chapters/            # per-chapter markdown (written by the fan-out)
ULTRA-SENSITIVE.md   # integrated manuscript (integrator output)
```
