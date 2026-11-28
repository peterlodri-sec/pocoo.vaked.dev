---
title: "Nuresh v0.2.0: 47.8 GB/s Bare-Metal ARM64 NEON Assembly for Nushell"
date: 2026-11-28
description: "Inside nuresh v0.2.0: caller-saved ARM64 NEON inline assembly kernels hitting 47.80 GB/s dot products and 46.30 GB/s multi-core byte scans (50x Rust std, 8.3x macOS wc -l), CaveCrew unsafe audit, and a #![no_std] drop-in crate."
tags: [rust, arm64, neon, assembly, nushell, apple-silicon, performance, research]
draft: false
section: research
---

# Nuresh v0.2.0: 47.8 GB/s bare-metal ARM64 NEON assembly for Nushell

*nuresh v0.2.0 · arm64 neon · nushell 0.117.0 · fine touch from within · vaked.dev*

---

> **Repository:** [`8b-is/nuresh`](https://github.com/8b-is/nuresh) · **Tag:** [`v0.2.0`](https://github.com/8b-is/nuresh/releases/tag/v0.2.0) (`9e4da3c`) · **Landing site:** [`8b-is.github.io/nuresh`](https://8b-is.github.io/nuresh)

---

## Measured facts

Measured facts. Understandable explanations. Owner authority.

Nushell's structured data pipelines make shell scripts readable, yet its hottest inner loops — newline scanning, ASCII case conversion, numeric reductions, and prompt VCS lookups — still pay scalar Rust iterator and `Value` enum-dispatch overhead.

`nuresh` **v0.2.0** addresses those hot paths with hand-written `#![no_std]` ARM64 NEON inline assembly (`core::arch::asm!`) packaged in three artifacts:

1. **`nuresh-asm`** — zero-dependency `#![no_std]` Rust crate exporting `count_byte_neon`, `ascii_lower_in_place_neon`, `ascii_upper_in_place_neon`, `sum_i64_neon`, `sum_f64_neon`, and `dot_f64_neon`.
2. **`nu_plugin_nuresh`** — native plugin for Nushell `0.117.0` (`nuresh wc`, `nuresh lower`, `nuresh upper`, `nuresh sum`, `nuresh prompt`, `nuresh bench`).
3. **`nuresh`** — standalone CLI binary with Homebrew tap (`brew install 8b-is/tap/nuresh`) and SHA-256 verified `install.sh`.

All measurements below were recorded on Apple M1 Max (`aarch64-apple-darwin`, 64 MiB buffers, `nuresh bench --size-mb 64`):

| Kernel (64 MiB Buffer) | `nuresh` v0.2.0 (`asm!`) | Throughput | Baseline Comparison |
|---|---:|---:|---|
| `count_byte_neon` (`\n`, 1-core 128B + `uadalp`) | **1.52 ms** | **44.18 GB/s** | **50.0x faster** than `iter().filter().count()` (`75.93 ms`) |
| `count_byte_par` (`\n`, 8 P-cores) | **1.45 ms** | **46.30 GB/s** | Multi-core LPDDR5 saturation via 128B-aligned sharding |
| `dot_f64_neon` (`8x fmla.2d`, 128B) | **2.81 ms** | **47.80 GB/s** | **10.7x faster** than Rust `zip().map().sum()` (`30.11 ms`) |
| `sum_i64_neon` (`8x add.2d`, 128B) | **1.71 ms** | **39.26 GB/s** | 8 independent accumulators hiding Firestorm ALU latency |
| `ascii_lower_neon` (`64B ldp/stp`, UTF-8 safe) | **1.92 ms** | **35.00 GB/s** | **9.5x faster** than v0.1.0 16B loop; branchless UTF-8 safe |
| `sum_f64_neon` (`8x fadd.2d`, 128B) | **2.20 ms** | **30.48 GB/s** | **5.4x faster** than Rust `iter().sum()` (`20.89 ms`) |
| `nuresh wc` vs `/usr/bin/wc -l` (`hyperfine` 15x) | **~18 ms wall** | **7.2+ GB/s I/O** | **8.3x faster** than macOS `/usr/bin/wc -l` (`179.6 ms`) |

---

## 1. Zero callee-saved register spills and 128-byte cache-line loops

On Apple Silicon (M-series), an L1/L2 cache line is 128 bytes. `nuresh-asm` v0.2.0 rewrote every `core::arch::asm!` kernel to restrict clobbers strictly to caller-saved NEON registers (`v0..v7`, `v16..v31`) with `options(nostack, readonly)` on read-only kernels, eliminating callee-saved stack spills around small buffers.

In `count_byte_neon`:

- Each inner iteration loads a full 128-byte cache line via four `ldp` pairs (`ldp q16, q17` through `ldp q22, q23`), compares with `cmeq .16b`, and subtracts the `-1`/`0` mask into 8 independent 8-bit vector accumulators for up to `255` iterations.
- Because `255` iterations cannot overflow an unsigned 8-bit lane, the outer loop only drains via pairwise widening `uadalp .8h, .16b` into four 16-bit accumulators (`v25..v28`) for up to `64` outer blocks (`64 * 255 * 128 = 2,088,960` bytes, max `64 * 510 = 32,640 < 65,535`).
- A single `uaddlv` + `umov` reduction executes once per ~2 MiB chunk rather than inside the hot loop.

For reductions (`sum_i64_neon`, `sum_f64_neon`, `dot_f64_neon`), keeping 8 independent vector accumulators (`add.2d`, `fadd.2d`, `fmla.2d`) hides Firestorm's 3-to-4 cycle floating-point/vector ALU latency, pushing `dot_f64_neon` to **47.80 GB/s** and `sum_i64_neon` to **39.26 GB/s**.

For ASCII case conversion (`ascii_lower_in_place_neon` and `ascii_upper_in_place_neon`), 4-way unrolled 64-byte `ldp`/`stp` loops saturate all 4 Firestorm NEON pipes while remaining branchlessly UTF-8 safe (non-ASCII bytes with high bit set fall outside `'A'..='Z'` / `'a'..='z'` unsigned range checks).

---

## 2. File I/O, multi-core sharding, and CaveCrew safety audit

Raw SIMD throughput is wasted if file handling blocks on a FIFO, pays Mach VM page-fault overhead on tiny files, or introduces `unsafe` pointer-provenance bugs. `v0.2.0` pairs the assembly rewrite with an end-to-end safety and I/O pass:

- **No FIFO/device hangs:** Files open with `O_NONBLOCK` and verify `meta.file_type().is_file()` before `read` or `mmap`.
- **4 MiB `read()` vs `mmap` boundary:** Files under `4 MiB` take direct `read()` to skip `mmap` setup and Mach page-fault overhead (and avoid `SIGBUS` exposure). Buffers `>= 4 MiB` enable `madvise(Sequential | WillNeed)` and 128B-aligned P-core sharding (`count_byte_par`, `ascii_lower_par`) via `std::thread::scope`.
- **Strict provenance in safe Rust tails:** Zero `slice::from_raw_parts` on `asm!`-mutated pointers; remainder bytes under 128B/16B run in safe Rust slice loops.
- **Bounded prompt & CLI inputs:** `nuresh prompt` caches `HOME` via `OnceLock`, replaces `canonicalize()` with a single `readlink`, caps `.git` / `.git/HEAD` reads at `4 KiB`, uses UTF-8-safe `chars().take(7)` slicing, and validates flags with `u8::try_from` and `checked_mul`.

---

## 3. Install and reproduce

```sh
# Homebrew (macOS / Linux)
brew install 8b-is/tap/nuresh
nu -c "plugin add (brew --prefix)/bin/nu_plugin_nuresh"

# Or one-line SHA-256 verified installer
curl -fsSL https://raw.githubusercontent.com/8b-is/nuresh/main/install.sh | sh

# Reproduce the 64 MiB hardware benchmark
nuresh bench 64
```

Dual-licensed `MIT OR Apache-2.0`, MSRV `1.85+`.

---

## Receipts

- **Repository & release:** [`8b-is/nuresh` `v0.2.0`](https://github.com/8b-is/nuresh/releases/tag/v0.2.0) (release commit `f55062a`, Homebrew SHA-256 stamp `9e4da3c`)
- **Changelog & security policy:** [`CHANGELOG.md`](https://github.com/8b-is/nuresh/blob/main/CHANGELOG.md) · [`SECURITY.md`](https://github.com/8b-is/nuresh/blob/main/SECURITY.md)
- **Live site:** [`8b-is.github.io/nuresh`](https://8b-is.github.io/nuresh)
