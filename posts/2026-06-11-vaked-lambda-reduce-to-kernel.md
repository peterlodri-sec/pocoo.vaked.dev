---
title: "Reduce till it's a constant: turning config functions into kernel modules"
date: 2026-06-11
tags: [vaked, compilers, lambda-calculus, unikernels, mythos, mirageos, codegen]
description: "We model compiled config functions as a small lambda IR and reduce them - known config folds to a compiled-in constant, unknown config stays a minimal residual. One IR targets a MirageOS unikernel and the MyThOS microkernel. Plus: two plausible-but-fake APIs our emitter invented, and how grounding and an independent review caught them."
draft: false
---

Most of our config isn't computed - it's chosen. A function reads one boot key and returns one of four strings. That isn't a runtime decision; it's a lookup we could have settled before the kernel ever booted.

This post is about settling it at build time: modelling compiled config functions as a tiny lambda IR, reducing them until what is known becomes a constant, and lowering what's left into a kernel module. It's also about two APIs our code generator confidently invented that do not exist, and how we caught them before they shipped.

The running example is `vaked-lambda`, the lambda-reduction layer of our compiler `vaked`.

## The reduction: 10 nodes to 1

Our config functions are pure lambdas. Take `vis_from_env`, which reads the `MASTODON_VISIBILITY` env var and returns a visibility string - "public", "private", "direct", or "unlisted" as the default. In Amber, it compiles to a match expression:

```
fn vis_from_env(): λenv. match env["MASTODON_VISIBILITY"] {
  "public"  => "public",
  "private" => "private",
  "direct"  => "direct",
  _         => "unlisted"
}
```

We model this as a small lambda IR with five node types: `Lit` (literal values), `EnvVar` (env lookups), `Match` (case expressions), `Abs` (lambda abstraction), and `App` (function application). The key insight is that we can reduce this term in two passes - beta-reduction (inlining applications) and constant-folding (simplifying known values) - applied repeatedly by `normalize()` until we reach a fixed point.

Reduction sorts every term into one of two buckets:

- **Closed terms**: no `EnvVar` nodes left. These reduce to a constant at build time.
- **Open terms**: still contain `EnvVar` nodes. These stay as a residual to resolve later, at boot or runtime.

Here's what reduction does to `vis_from_env`:

| Scenario | IR nodes | Closed? | Runtime cost |
|---|---|---|---|
| Before reduction | 10 | no | - |
| `MASTODON_VISIBILITY` unknown at build time | 7 | no | dispatch required |
| `MASTODON_VISIBILITY=public` known at build time | **1** | yes | zero (compiled constant) |

The progression tells the story. Start with 10 nodes: the lambda, the match, three branches, the wildcard default, the env lookup, the literals. No reduction is possible without knowing the env var's value.

If we don't know it at build time, we reduce as far as we can - beta-reduction inlines the application, but constant-folding can't simplify the match without a concrete scrutinee. We're left with 7 nodes: the match skeleton, the branches, the default, and the env lookup. The term stays open. At runtime, we still need to evaluate that lookup and dispatch through the match.

But if we know `MASTODON_VISIBILITY=public` at build time - because it's baked into the image or set as a build flag - reduction finishes the job. The match's scrutinee becomes the literal `"public"`, the first branch wins, and constant-folding collapses everything to a single `Lit` node: the string `"public"`. The term is closed. No `EnvVar`, no dispatch, no decision tree to walk. The entire function call has vanished into a compile-time constant.

To measure the reduction cost itself, we benchmarked 1,000,000 ops of construction plus reduction on the closed path: **895 ns/op**. Honest note: this includes constructing the lambda IR each iteration and the term is tiny. The real point isn't the 895 ns - it's that reduction is a build-time operation. When the result is closed, it costs zero at runtime, because it's a compiled-in constant, not a 895 ns call. When it's open, the residual is embedded once and evaluated at boot. Either way there's no per-request overhead.

That's the payoff of pure config functions and staged compilation: known values don't just optimize, they disappear.

The same numbers as a picture:

```
IR nodes, vis_from_env (lower is better)

before reduce        ##########  10
open  (env unknown)  #######      7
closed (env known)   #            1
```

## Inside the two passes

`normalize()` chains two rewrite passes - BetaReduce and ConstFold - in a loop until the term reaches a fixed point (no rewrite changes anything).

**BetaReduce** eliminates applications. When it sees `App(Abs(param, body), arg)` it does a capture-aware substitution: `arg` replaces the free occurrences of `param` in `body`. It also recurses into Match, Abs, and nested App, so one pass can fire several substitutions.

**ConstFold** does two things. First it resolves env lookups: an `EnvVar{name, default}` rewrites to `Lit(value)` when `name` is in the compile-time env. Second, when a `Match`'s scrutinee is a `Lit`, it selects the matching branch (or the wildcard default) and drops the dead branches.

Take the applied term `App(vis_from_env_lambda, "")`. With compile-time env `{MASTODON_VISIBILITY: "public"}`, the closed path unfolds:

```
1. App(Abs("env", Match(EnvVar("MASTODON_VISIBILITY","unlisted"), [...], "unlisted")), "")
     -> BetaReduce: substitute the arg for "env" in the body
2. Match(EnvVar("MASTODON_VISIBILITY","unlisted"),
         [("public","public"),("private","private"),("direct","direct")], "unlisted")
     -> ConstFold: env key known, resolve EnvVar to Lit("public")
3. Match(Lit("public"),
         [("public","public"),("private","private"),("direct","direct")], "unlisted")
     -> ConstFold: scrutinee is Lit("public"); take the "public" branch, drop the rest
4. Lit("public")     # fixed point: 1 node
```

The dead branches `("private","private")` and `("direct","direct")` are eliminated at step 3, and the `"unlisted"` default is dropped too because the scrutinee matched deterministically.

The open path (empty compile-time env) runs the same beta step, but ConstFold can't resolve the `EnvVar` - there's no entry for the key - so the `Match` can't be evaluated and every branch survives. It stops at the 7-node Match, scrutinee still an `EnvVar`. The loop keeps swapping the two passes until an iteration changes nothing; that's the fixed point.

The whole path, end to end:

```
Amber fn        Discover         normalize()             residual?     emit
------------    -------------    -------------------     ---------     ------------------------------
vis_from_env -> lambda IR     -> beta + const-fold    -> closed ---->  constexpr        (MyThOS)
                (Term)           to fixed point                        "public"         (MirageOS)
                                                         open   ---->  BootConfig seam  (MyThOS)
                                                                       List.assoc_opt   (MirageOS)
```

## Targeting MyThOS: static composition, not loadable modules

When we say "kernel module" here, we do not mean a Linux `.ko` or any runtime-loadable object. The target is MyThOS, a manycore research microkernel written in C++ (about 96% C++, 3.6% assembly). It composes entirely at build time. A "module" is a directory containing a descriptor file (`mcconf.module`) and C++ sources. The build tool `mcconf` - a Python utility - reads those descriptors and assembles the kernel statically; if a module changes, you rerun `make`. That's the whole lifecycle. There is no runtime module load and no dynamic symbol resolution.

This static-composition model is exactly why we care. Core services that live as resident kernel modules are fast (no dispatch overhead at runtime) and always present (no need to check whether a service is loaded). The tradeoff is that we commit to configuration before the kernel boots - which is precisely what the reduction step above buys us.

For a **closed** term - config fully resolved during reduction - we emit a `constexpr` straight into the kernel image:

```cpp
#ifndef VAKED_VIS_PUBLIC_HPP
#define VAKED_VIS_PUBLIC_HPP

// Closed term: config was known at build time and folded to a constant.
// Baked into the static kernel image; zero runtime dispatch.
namespace vaked {
constexpr const char* value = "public";
} // namespace vaked

#endif // VAKED_VIS_PUBLIC_HPP
```

The value is baked into the compiled binary. No lookup, no branch, no boot-time decision. The optimizer sees a constant and inlines it anywhere it appears. That's the "always there, super fast" payoff.

For an **open** term we can't bake a fixed value, so we emit a function over a self-contained boot-config seam. The header declares the interface, and crucially we *define the seam ourselves* rather than assume a MyThOS API exists:

```cpp
namespace vaked {

// Integration seam - wire to MyThOS boot config.
struct BootConfig {
    const char* get_or(const char* key, const char* fallback) const;
};

const char* vis_from_env(const BootConfig& cfg);

} // namespace vaked
```

The source lowers the `match` to an if / else-if chain over `std::string_view` equality. This is the actual generated `.cc`:

```cpp
#include "vis_from_env.hpp"

namespace vaked {

const char* vis_from_env(const BootConfig& cfg) {
    const std::string_view scrutinee{cfg.get_or("MASTODON_VISIBILITY", "unlisted")};
    if (scrutinee == "public") {
        return "public";
    }
    else if (scrutinee == "private") {
        return "private";
    }
    else if (scrutinee == "direct") {
        return "direct";
    }
    return "unlisted";
}

} // namespace vaked
```

The three branches are `public`, `private`, `direct`; `unlisted` is the wildcard fallback, emitted as the trailing `return`, not a branch.

The `mcconf.module` descriptor we generate uses only real fields:

```
# -*- mode:toml; -*-
[module.vaked-vis_from_env]
    incfiles = [ "vis_from_env.hpp" ]
    srcfiles = [ "vis_from_env.cc" ]
```

Both samples - open and closed - pass `c++ -std=c++17 -Wall -Wextra -fsyntax-only`. The open seam compiles even though `BootConfig::get_or` is declaration-only at that point: that's the integration point the kernel wires up.

Honest note: the `BootConfig` seam isn't magic, it's a convention. A kernel that wants our lowered config must implement `get_or` against wherever it keeps boot parameters. If it doesn't, the link fails - and that failure is *desirable*. It forces explicit wiring instead of hiding a fake dependency behind a framework.

## One IR, two backends - and the honest part

The reduced term is target-agnostic. The same `Term` feeds multiple emitters: one for OCaml (MirageOS unikernels) and one for C++ (MyThOS). Reduction happens once; emission happens many times.

Emit size for the canonical `vis_from_env` term:

| Target | open (residual) | closed (constant) |
|---|---|---|
| MyThOS C++ (header + source) | 998 B | 331 B |
| MirageOS OCaml | 196 B | **8 B** |

```
emit size, bytes (closed = what's left after reduction)

MyThOS C++  open    ################################  998
MyThOS C++  closed  ###########                        331
Mirage OCaml open   ######                              196
Mirage OCaml closed |                                     8
```

The closed OCaml case is the whole thesis in 8 bytes: it is literally `"public"`. When the term reduces to a constant, the emitter outputs a constant. The open OCaml case (196 B) is a lookup over an assoc list; the C++ cases are larger because each emits a header plus a source file with declarations and the dispatch function.

That multiplexing is the point - but emission introduced a new risk, and it's worth being blunt about it. An LLM-driven emitter will confidently produce plausible-but-fake code that never compiles against the real upstream. We caught two such fabrications and removed them.

**Fabrication 1: `Mirage_kv.get_opt`.** Our first OCaml emitter generated this for open-term lookups:

```ocaml
Mirage_kv.get_opt env "MASTODON_VISIBILITY"
```

It does not exist. The real MirageOS KV interface is Lwt-based:

```ocaml
val get : t -> key -> (string, error) result Lwt.t
```

There is no synchronous `get_opt`. We caught it on review - not by compiling, but by checking the claim against the real API - and the emitted line would never have built against Mirage. The fix was honest OCaml stdlib over an assoc list:

```ocaml
(match List.assoc_opt "MASTODON_VISIBILITY" env with Some v -> v | None -> default)
```

**Fabrication 2: `appfiles`.** Our `mcconf.module` emitter wrote a field called `appfiles`, with a comment claiming it was "verbatim from real descriptors." It wasn't. An independent spec-review pass pulled actual `mcconf.module` files from the MyThOS repo and checked the schema: the real source-file field is `srcfiles` (a search for `appfiles` returns zero hits). The reviewer flagged the contradiction between the comment and reality; we corrected the emitter to `srcfiles` and `.cc`.

Neither error was subtle, and that's the unsettling part. Both followed the naming and shape of the real upstream closely enough to pass a casual read. The first was caught by knowing the actual API; the second by an adversarial review that verified every emitted field against the repo instead of trusting the author's comment.

| emitted (fake) | the reality | caught by |
|---|---|---|
| `Mirage_kv.get_opt env "K"` | Mirage KV is Lwt: `get : t -> key -> (string, error) result Lwt.t` - no sync `get_opt` | review against the real API |
| mcconf `appfiles` | the real field is `srcfiles`; `appfiles` has zero hits in the repo | adversarial spec-review against the repo |

The lesson: an LLM emitter invents APIs that *sound* right. The defense is not trust - it's grounding (fetch the real upstream format or API before emitting) plus an independent verification pass that assumes the author got it wrong until proven otherwise. Neither check requires downstream expertise. Both require access to ground truth and the willingness to verify before shipping.

## The OCaml side: the same term, in MirageOS

The C++ above is one backend. The same reduced term lowers to OCaml for a MirageOS unikernel - and after de-faking the API, it's plain stdlib. The open term:

```ocaml
(match (match List.assoc_opt "MASTODON_VISIBILITY" env with Some v -> v | None -> "unlisted") with
  | "public" -> "public"
  | "private" -> "private"
  | "direct" -> "direct"
  | _ -> "unlisted")
```

`env` is a `(string * string) list`; the lookup is `List.assoc_opt`, the dispatch is an ordinary OCaml `match`. Nothing MirageOS-specific, nothing invented - it compiles against the standard library. The closed term is the whole point in one token:

```ocaml
"public"
```

Eight bytes. Same `Term`, same reduction, two targets: a C++ `constexpr` for the static microkernel, an OCaml literal for the unikernel. The backend is a lowering function over the IR; adding a third target (Zig, a config blob, a shell export) is another `emit_*`, not another reduction.

## Discover: the compiler tells us the shape

We don't hand-write the IR for each function. `Discover` reads the shape of the compiled function - an env-var-with-default feeding a `case` - and derives the lambda:

```
Discover::env_case_lambda(
  "MASTODON_VISIBILITY", "unlisted",
  [("public","public"), ("private","private"), ("direct","direct")],
)
//  =>  λenv. match env["MASTODON_VISIBILITY"] { "public" => "public", … | _ => "unlisted" }
```

That's the "just allow them what they do" principle: the structure comes from what the function already does, not from a spec we impose on it. Every env-dispatch selector - visibility, backend, log level, feature flag - is the same shape, so one `Discover` pattern covers the whole family, and each one reduces by the same two passes to either a constant or a minimal residual.

## What "reduce till max" actually costs

`normalize()` applies beta-reduction and constant-folding repeatedly until the term stops changing - reduce till the fixed point, and whatever's left is the minimal residual. The build-time microbench was 1,000,000 ops in 895 ms, call it 895 ns per normalization, with the sharp caveat from earlier: it includes constructing the IR each iteration and the terms are tiny. The number is not the latency that matters.

What matters is *when* it runs. A closed term reduces to a constant that compiles into the binary as `constexpr` - at runtime there's no dispatch, no computation, no cost. An open term reduces to the smallest dispatch needed to fill the gaps, and only that residual reaches the kernel at boot. We pay the 895 ns once, at build time. Closed paths pay zero afterward; open paths pay only for what genuinely can't be precomputed.

The emit is verified, not hand-waved:

| check | result |
|---|---|
| `cargo test -p vaked-lambda` | 11 passed |
| `cargo clippy` (CI: warnings = errors) | clean |
| `c++ -std=c++17 -Wall -Wextra -fsyntax-only` (open + closed `.cc`) | passes |

The output is syntactically real C++, not a sketch.

## The bigger picture: services that are always there

The long bet is that core services should live as always-resident kernel modules - not deferred processes you load on demand, not remote RPC targets, but code and data baked into the kernel image. That changes two things: speed and presence. A resident service has no dispatch overhead, and it is always there - no checking whether it's loaded, no network hop to a remote host.

The tradeoff is that you must commit to configuration before the kernel boots. You cannot fetch config from a remote service at runtime; you bake it in ahead of time. That is exactly what "reduce till max" buys: push as much work as possible to build time, ship only the minimal residual to the kernel. Closed terms compile out to constants; open terms reduce to the smallest dispatch needed, and only that residual reaches the kernel. The optimization goal is to maximize what's resolved at build time - distribution, utilization, speed of execution - and push as little as possible to runtime.

One IR, many targets. The same reduced term feeds two emitters: OCaml for MirageOS unikernels, C++ for the MyThOS static-composition microkernel. Reduction is target-agnostic; emission is not. The OCaml emitter outputs a stdlib assoc-list lookup; the C++ emitter outputs a dispatch function plus a `BootConfig` seam, the integration point the kernel wires up. The C++ output compiles and links only when the kernel provides that wiring - and that link failure is desirable, because it forces explicit integration rather than a hidden fake dependency.

Here is what exists today, stated plainly. We have the lambda IR (five node types), the two reduction passes (beta + constant-fold) applied to a fixed point by `normalize()`, a `Discover` step that extracts the lambda from a compiled function's env-case shape, and two emitters that produce output for the `vis_from_env` example - both checked against ground truth: the C++ samples pass a C++17 syntax check, and the OCaml emitter uses only stdlib (no fabricated Mirage API). The example reduces a 10-node term to 1 when config is known, or to 7 when it isn't.

This is an early layer, not a finished kernel build pipeline. The wiring between the emitted modules and the actual MyThOS or Mirage build systems is still manual; the boot-config integration is our `BootConfig` seam, not something the kernels hand us yet. Proving constant-folding wins at scale - a real image with dozens of resident services, across a real fleet - comes next. For now the point stands: we can model config as data, reduce it at compile time, and emit to multiple kernel targets from one normalized form.

## Takeaways

- **Pure config functions can be reduced at build time.** Known config folds to a compiled-in constant (zero dispatch); unknown config becomes a minimal residual the kernel resolves at boot. Known values don't just optimize - they disappear.
- **"Kernel module" depends on the kernel.** MyThOS has no loadable `.ko`; it composes statically via `mcconf`. A closed term becomes a `constexpr` in the image, an open term becomes a `BootConfig` seam we define ourselves.
- **One IR, many backends.** The same reduced term emits OCaml for MirageOS and C++ for MyThOS. Reduction is target-agnostic; emission is not.
- **An LLM emitter will invent plausible-but-fake APIs.** `Mirage_kv.get_opt` and the `appfiles` mcconf field both looked right and were both fictional. Ground against the real upstream before emitting, and verify with an independent review pass. Don't trust output that hasn't been checked against ground truth.
