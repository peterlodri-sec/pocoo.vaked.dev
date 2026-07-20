---
title: "Resurrecting rustybox: a six-year-dead C2Rust transpile, made to build again"
date: 2026-07-20
tags: [rust, c2rust, busybox, musl, cross-compilation, tooling]
description: "rustybox is a c2rust transpile of BusyBox that stopped compiling in 2020. I brought it back to a modern nightly and shipped fully-static x86_64 + aarch64 musl binaries. Here's every wall I hit — llvm_asm, the c_variadic API churn, c_char signedness, glibc-only symbols — and the one move that deleted 21 errors for free."
draft: false
---

[rustybox](https://github.com/peterlodri-sec/rustybox) is a fork of BusyBox written entirely in Rust — except it wasn't written, it was *transpiled*. Someone ran [c2rust](https://github.com/immunant/c2rust) over the whole of BusyBox in 2019, got a compiling pile of `unsafe` raw-pointer Rust, and then the repo went quiet in May 2020.

Six years later it does not compile. Not "has warnings" — the toolchain physically rejects it: `#![feature(llvm_asm)]` was removed from the compiler in 2022, three other feature gates were stabilized or deleted, and the pinned `libc` is from 2019. It's a fossil.

I wanted it as an embeddable static userland, so I dug it out. This is the log of getting a dead transpile to build, link, and run on a current nightly — and then to produce fully-static binaries for **two** architectures from one source tree.

## The starting line

566 `.rs` files, 395 applets, edition 2018, last commit titled *"llvm_asm! is the new asm!"* (it was not, for long). First real build on a current nightly:

```
error: could not compile `rustybox` due to 156 previous errors; 2553 warnings emitted
```

156 errors, six distinct kinds. Every one of them is a story about how Rust — or the platform underneath it — moved on.

## The mechanical layer: dead language features

Most of the 156 were the compiler having deleted things the transpile relied on.

**`llvm_asm!` (89 files).** c2rust emitted inline asm for two things: compiler barriers and byte swaps. The barriers — `asm("" : : : "memory" : "volatile")` — are just `compiler_fence(SeqCst)`. The byte swaps were the interesting ones: c2rust wraps them in `if false { /* pure-Rust bswap */ } else { /* asm bswap */ }`. The pure-Rust branch was *already sitting right there*, dead. So `bswap`/`rorw` inline asm collapses to `.swap_bytes()` — and, as a bonus, becomes architecture-portable, which mattered a lot later.

**`c_variadic` API churn.** The nastiest mechanical one. The `VaList` API has been reshaped repeatedly while unstable:

- `::std::ffi::VaListImpl` → `VaList`
- `.arg::<T>()` → `.next_arg::<T>()`
- `.as_va_list()` → *gone* (a `VaList` is now directly FFI-passable; the old borrow becomes a move)

This touches the core printf/error-message plumbing (`bb_verror_msg`, `getopt32`, the shell), so nothing links until it's right.

The rest were routine: `label_break_value` and `ptr_wrapping_offset_from` are stable now (drop the gates, `wrapping_offset_from` → `offset_from`), and packed-struct field references need `&raw` instead of `&`.

That got the tree compiling on `aarch64` (my dev box is an M-series Mac; the build runs in a Linux container, natively arm64). Then I tried the other architecture, and the interesting part started.

## The platform layer: your libc is not one libc

Two builds of "the same" code disagree, because the c2rust transpile baked in the assumptions of *one* target (x86_64 glibc) and I was now asking for four combinations: {glibc, musl} × {x86_64, aarch64}.

**`st_nlink` is not a fixed width.** On x86_64, `struct stat`'s `st_nlink` is 64-bit; on aarch64 it's 32-bit. The transpiled code compares it against a `c_ulong` and only typechecks on the arch it was born on. Fix is a portable cast, and this repeats for `utmp`'s `tv_sec` and friends.

**`ioctl` request argument.** glibc's `ioctl` takes the request as `c_ulong`; musl takes it as `c_int`. The libc crate models this as a per-target `Ioctl` alias. So the request expression can't be hard-cast — it has to be `as _` and let inference pick the platform's type. (This bit me twice: a too-eager regex wrapped an *inner* cast inside a multi-line `_IOC` macro and produced `as _` where nothing could infer the type. Lesson: don't run a multiline regex across expressions that contain the same token more than once.)

**`termios` field names.** glibc calls the speed fields `c_ispeed`/`c_ospeed`; musl calls them `__c_ispeed`/`__c_ospeed`. In a struct literal you can't paper over that with a cast — but you *can* `#[cfg]` individual fields in an expression, which most people don't know:

```rust
termios {
    // ...
    #[cfg(not(target_env = "musl"))] c_ispeed: 0,
    #[cfg(target_env = "musl")]      __c_ispeed: 0,
    // ...
}
```

**And the one that actually taught me something: `c_char` signedness.** `libc::c_char` is `u8` on aarch64 and `i8` on x86_64. rustybox has big `[c_char]` data tables — BusyBox's packed applet-option strings — full of high-bit bytes. On aarch64 (`u8`) I'd "fixed" them by writing `-1` as `255`. That's *wrong* on x86_64, where the array is `[i8]` and `255` is out of range. Neither a signed nor an unsigned literal is correct on both. The portable form is a cast that truncates rather than range-checks:

```rust
255u8 as libc::c_char   // 255 on aarch64 (u8), -1 on x86_64 (i8) — both legal
```

I only learned this because I was building both arches. If I'd only ever built on one, I'd have shipped something that silently fails to compile for half my users.

## The leverage move

At one point musl had 173 errors and I was staring down a long hand-fixing session. Then I looked at the pinned dependency: `libc 0.2.65`, from 2019. I bumped it to current (`0.2.186`) and **21 errors evaporated** — musl's `utmpx`, `nlmsghdr`, and other bindings simply didn't exist in the 2019 crate. glibc stayed green.

The lesson I keep re-learning: before you hand-fix a hundred symptoms, check whether one of your six-year-old dependencies is the disease.

## glibc-only symbols musl doesn't have

The last wall was linking. Some things the transpile calls are glibc *macros* that expand to private helper symbols — `gnu_dev_major`/`gnu_dev_minor`/`gnu_dev_makedev` (behind `major()`/`minor()`) and `__cmsg_nxthdr` (behind `CMSG_NXTHDR`). musl implements those inline and exports no such symbol. c2rust, transpiling on glibc, emitted `extern` calls to them.

The fix is a set of musl-only shims — provide the symbols the linker is looking for, with glibc's own encoding, `#[cfg]`'d to musl:

```rust
#[cfg(target_env = "musl")]
#[no_mangle]
pub extern "C" fn gnu_dev_major(dev: libc::dev_t) -> libc::c_uint {
    (((dev >> 8) & 0xfff) | ((dev >> 32) & !0xfff)) as libc::c_uint
}
```

Same idea for `stime` (removed from glibc in 2.31 — reimplement via `clock_settime`) and `__res_mkquery` (renamed; the versioned symbol isn't directly linkable, the public `res_mkquery` is).

## Cross-linking from the wrong architecture

Last snag: building an x86_64-musl binary on an arm64 host, the native `cc` chokes on `-m64`. The clean fix is to link with `rust-lld`, which is target-agnostic and ships with the toolchain. Set it for the musl targets in `.cargo/config.toml` and you can cross-build any architecture from any host with no per-arch cross-`cc`:

```toml
[target.x86_64-unknown-linux-musl]
linker = "rust-lld"
rustflags = ["-C", "target-feature=+crt-static", "-C", "linker-flavor=ld.lld"]
```

## Receipts

```
156 compile errors ─▶ 0
2 link errors       ─▶ 0
```

Fully-static, `--all-features` compiles; curated-core release binaries:

| target | size (stripped) | runs? |
|---|---|---|
| x86_64-unknown-linux-musl | 856 KB | yes (verified via qemu) |
| aarch64-unknown-linux-musl | 631 KB | yes (native) |

Both are `not a dynamic executable`. `echo`, `cat`, `ls`, `date`, `sort -n`, `uniq`, `wc`, `head` all behave.

## What it doesn't fix

The internals are still transpiled C: raw pointers, `unsafe`, ~7000 inherited warnings. It *compiles and runs* — it is not yet *good* Rust. That's the next project: swapping the transpiled guts of the common applets for the ecosystem's memory-safe implementations (`uutils` for the coreutils family, the `grep-*` crates for `grep`, `ignore`/`walkdir` for `find`), applet by applet, behind the same BusyBox CLI. `rustybox grep` should keep behaving like `grep` while `ripgrep`'s engine does the work underneath.

But the fossil breathes again, on a current toolchain, on two architectures, as one static binary. Resurrection first; idiomatic second.
