---
title: "RustyBox v0.4.0: Zero-Alloc O(log N) Dispatch, 8.24x HW SHA-2, 6.64x Grep & RFC 10008 Agent Search"
date: 2026-11-28
description: "Inside RustyBox v0.4.0: replacing 399 startup heap allocations with compile-time sorted dispatch tables, bypassing StdoutLock's LineWriter for 1,631 MB/s grep and 1,317 MB/s SHA-256, cutting rustybox-core release size by 6.4%, and serving RFC 10008 HTTP QUERY search."
tags: [rust, rustybox, busybox, musl, performance, cryptography, systems, research]
draft: false
section: research
---

# RustyBox v0.4.0: zero-alloc O(log N) dispatch, 8.24x HW SHA-2, 6.64x grep & RFC 10008 agent search

*rustybox v0.4.0 · static musl userland · zero-alloc dispatch · fine touch from within · vaked.dev*

---

> **Earlier in the series:** [Resurrecting rustybox: a six-year-dead C2Rust transpile, made to build again](/posts/2026-07-20-resurrecting-rustybox.html) · **Repository:** [`8b-is/rustybox`](https://github.com/8b-is/rustybox) · **Live site & agent index:** [`rustybox.io`](https://rustybox.io)

---

## Measured facts

Measured facts. Understandable explanations. Owner authority.

In July, we resurrected `rustybox` from a six-year-dead `c2rust` transpile of BusyBox into dual-architecture static `musl` binaries (`x86_64` and `aarch64`) for **kernel8**, **vakedkernel**, and **Entheai** agent sandboxes. Getting 399 applets to compile on modern nightly Rust was step one. Making the MIT-licensed `rustybox-core` multicall binary fast enough that agents and minimal containers never notice the switch is **v0.4.0** (commit `b41b0c18`).

Every measurement below was recorded head-to-head on `rustybox-core` release builds (`aarch64-apple-darwin`, `rustc 1.99.0-nightly`):

| Workload | Before (`v0.3.x`) | `v0.4.0` | Speedup / Delta | Mechanism |
|---|---:|---:|---:|---|
| `sha256sum` (64 MiB) | 400.12 ms (`160.0 MB/s`) | **48.59 ms (`1,317.3 MB/s`)** | **8.24x faster** | Unified `digest 0.11` HW SHA-2 + stack `HEX_LUT` + 128 KiB read buffer |
| `grep -n` (32 MiB, ~82k matches) | 130.23 ms (`245.8 MB/s`) | **19.62 ms (`1,631.2 MB/s`)** | **6.64x faster** | `MmapChoice::auto()` + 64 KiB `BufWriter<RawStdout>` + stack int formatting |
| `grep -F` (32 MiB fixed-string) | 114.95 ms (`278.4 MB/s`) | **17.86 ms (`1,792.3 MB/s`)** | **6.44x faster** | Native `RegexMatcherBuilder::fixed_strings(true)` |
| `gunzip -c` (16 MiB → stdout) | 38.20 ms (`419.6 MB/s`) | **16.10 ms (`995.5 MB/s`)** | **2.37x faster** | 64 KiB `copy_64k` loop + `RawStdout` (bypasses `LineWriter` scan) |
| `tar -cf` (2,000 files) | — | **61.01 ms** | **1.58x faster** | 64 KiB `BufReader`/`BufWriter` (replaces 512-byte unbuffered writes) |
| `tar -tf` (2,000 files) | — | **12.07 ms** | **1.45x faster** | 64 KiB buffered stdout |
| `grep -r` / `gzip -c` / `find` / `xargs` | — | — | **1.43x / 1.39x / 1.17x / 1.12x** | Streaming traversal, `lstat` cache, zero-copy token slices |
| Symlink dispatch | — | **9.94 ms** | **1.03x faster** | Zero-alloc compile-time sorted `const` binary search (`O(log N)`) |
| `rustybox-core` release binary | 9.53 MB | **8.93 MB** | **-6.4% smaller** | Fat LTO, `codegen-units = 1`, `panic = "abort"`, hot/cold `opt-level` split |

Baseline throughput on the same `v0.4.0` build hits **`3,743.9 MB/s`** on `cat` and **`2,570.7 MB/s`** on `wc -l`. Ultra-compact `*-slim` static `musl` binaries (stripped + `upx --best --lzma`) land at **`~3.2 MB`** for `FROM scratch` containers.

---

## 1. Killing 399 startup heap allocations with compile-time sorted dispatch

Previously, every single invocation of `rustybox` — even `true` or `false` inside a tight shell loop — paid to initialize a `lazy_static! { Vec<applet> }` containing 399 `.push()` allocations and then ran an `O(N)` linear scan to match `argv[0]`.

In `v0.4.0`:

- `applets/applet_tables.rs` and `libbb/appletlib.rs` replace that runtime vector with a compile-time `pub const applets: &[applet]` slice, compile-time strict ASCII lexicographical sort verification, and `binary_search_by_key` (`O(log N)`).
- `crates/rustybox-core/main.rs` (`93` memory-safe MIT applets on Linux, `91` on macOS) uses the identical pattern: `const APPLETS: &[(&str, Handler)]` verified sorted at compile time, forwarding `args_os()` zero-copy directly into `uutils` `uumain`.

Zero startup heap allocation before your applet even begins parsing flags.

---

## 2. The hidden syscall tax: `std::io::StdoutLock` wraps stdout in `LineWriter`

The single highest-leverage fix across `modern/grep.rs`, `modern/hashsum.rs`, `modern/compress.rs`, `modern/tar.rs`, and `modern/find.rs` had nothing to do with regex engines or compression codecs.

In Rust's standard library, `std::io::stdout().lock()` wraps file descriptor 1 in a `LineWriter`. For text tools (`grep -n`, `find`), every `\n` triggers an immediate `write(1)` syscall — turning one 64 KiB buffer into thousands of kernel transitions. Worse, for binary stdout streams (`gunzip -c`, `tar -cf -`), `LineWriter` still scans every compressed byte for accidental `0x0a` (`\n`) occurrences and flushes mid-block whenever one appears.

Replacing `StdoutLock` with a minimal `RawStdout` struct (`libc::write(libc::STDOUT_FILENO, ...)` with `EINTR` retry) wrapped in `BufWriter` (`64 KiB`) removed the per-line and `0x0a`-triggered flush tax across five core applets at once. Combined with `MmapChoice::auto()` in `grep-searcher` and a stack integer formatter for line numbers, `grep -n` jumped **6.64x** to **`1,631.2 MB/s`**. Combined with a `64 KiB` `copy_64k` loop (bypassing `std::io::copy`'s 8 KiB stack buffer over `dyn Read` / `dyn Write`), `gunzip -c` jumped **2.37x** to **`995.5 MB/s`**.

---

## 3. Deduplicating RustCrypto for 8.24x faster `sha256sum`

Prior to `v0.4.0`, `modern/hashsum.rs` and `uu_cksum` pulled in mismatched versions of RustCrypto crates, duplicating symbols in the binary and missing the `digest 0.11` runtime hardware-acceleration path on the `hashsum` side.

Aligning `md-5` (`0.11`), `sha1` (`0.11`), `sha2` (`0.11`), and `sha3` (`0.12`) with `uu_cksum`'s `digest 0.11` did two things simultaneously:

1. Enabled runtime **ARMv8 SHA2** and **x86 SHA-NI** hardware instructions (`160.0 MB/s → 1,317.3 MB/s`, **8.24x** faster on 64 MiB `sha256sum`).
2. Eliminated duplicate crypto crate codegen from the static binary.

We paired that with a 128 KiB `READ_BUF_SIZE` and a 16-byte stack `HEX_LUT` (`b"0123456789abcdef"`) in `modern/hashsum.rs`, replacing per-byte `format!("{b:02x}")` heap allocations.

---

## 4. Two editions, one static boundary, and RFC 10008 agent search

RustyBox keeps its licensing boundary explicit:

- **`rustybox-core` (MIT):** 93 memory-safe applets on Linux (`91` on macOS) built strictly on permissive crates (`uutils` coreutils, `ripgrep`'s `grep-regex` + `grep-searcher`, `walkdir`, `globset`, RustCrypto, `tar`/`flate2`/`bzip2`/`xz2`). Zero GPL-derived BusyBox code is compiled.
- **`rustybox` (GPL-2.0-only):** Full 399-applet BusyBox parity, compiled statically against `musl` for `x86_64` and `aarch64`, packed via `wild` + `upx --best --lzma`, with `cosign` provenance.

Because `rustybox-core` is built for autonomous agent sandboxes (`timeout --signal=TERM --kill-after=5s 30s`, `flock`, `xargs`, `setsid`), the `rustybox.io` Cloudflare Worker (`site/worker.ts`) now also ships **Search for Agents** at `/.well-known/search` supporting **RFC 10008 `HTTP QUERY`** (alongside `GET ?q=` and `POST`) and `Accept: text/markdown` content negotiation to `/llms.txt`, so agents inspecting the toolchain get ranked Markdown passages without scraping HTML.

---

## Receipts

- **Tag & commit:** [`8b-is/rustybox` `v0.4.0`](https://github.com/8b-is/rustybox/releases/tag/v0.4.0) (`b41b0c18`)
- **Changelog:** [`CHANGELOG.md`](https://github.com/8b-is/rustybox/blob/main/CHANGELOG.md)
- **Live agent-searchable docs:** [`rustybox.io`](https://rustybox.io) (`/.well-known/search`)
