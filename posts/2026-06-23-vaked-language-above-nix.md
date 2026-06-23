---
title: "Vaked: a capability language above Nix, not a replacement"
date: 2026-06-23
tags: [vaked, nix, language-design, capabilities]
description: "Vaked declares typed capability graphs and compiles them to boring artifacts. It is not a Nix replacement. Here is what that distinction actually means."
draft: false
---

Every new configuration language gets compared to the one it sits above. Vaked gets compared to Nix. The comparison misframes the project from the start.

Vaked is a **complement**. It operates at a different layer of abstraction and produces Nix as one of its output artifacts — alongside Zig daemon configs, eBPF policy manifests, and OpenTelemetry configuration. The compiler produces ordinary, inspectable files. Nothing Vaked generates is magic or locked in. You can read the output, hand-edit it, and throw the Vaked source away.

## What Vaked actually is

A Vaked file declares a **capability graph**: what agents exist, what state they share, what each is allowed to do, and how they depend on each other. The type checker validates the graph at compile time — catching capability overreach, dependency cycles, and schema violations before any artifact is emitted.

The core type system is structural and closed. A `runtime` block conforms to the `runtime` schema if and only if every required field is present, every field value matches its declared type, and every constraint holds. There is no nominal subclassing, no general expression language in constraints, no Turing-equivalent evaluation. These are design constraints, not oversights. Making the constraint set non-total would break the checker's ability to explain every rejection.

## Capabilities are explicit

The central bet is that making capabilities first-class in the language — not conventions in prose documentation — catches a class of bugs that no amount of testing finds.

Consider a fiber that should only read from a specific memory region. In Nix, this is documentation. In Vaked, it is a `capability` declaration with a `read` grant scoped to that region, and the type checker enforces the POLA ordering: you cannot grant what you do not hold, and you cannot delegate broader than your own grant. Every capability a principal can exercise at runtime is bounded by the grants held by its upstream delegators. This is the POLA invariant, verified at compile time.

## The mantra

> *Vaked declares. Nix materializes. Zig enforces. eBPF testifies.*

Each tool does one thing. Vaked holds the structure; Nix builds the system packages and services; Zig runs the enforcement daemons that make capability grants runtime-real; eBPF makes violations visible without trusting the process being observed.

The layering is not accidental. It is how you get a system that is both auditable (read the Vaked source to understand what the system does) and hardened (eBPF catches violations even if the Zig daemon is compromised).

## Compile to boring artifacts

The `--explain` flag on `vakedc` prints a decision trace for every check it runs. If the checker rejects your file, you get the exact rule that failed and why. If it accepts, you can follow the reasoning from input through every constraint to the emitted artifact.

This is the principle *Explain everything* made operational. The Vaked compiler is not allowed to be mysterious. Every rejection must be explainable in terms of the surface source, and every artifact must be traceable back to the declaration that generated it.

Nix is expressive and powerful. But a Nix flake that wires up a multi-agent system accrues implicit structure — which daemons can reach which others, what ports are open, which secrets are exposed — that lives only in prose comments and the author's head. Vaked externalizes that structure into a file the type checker can reason about.

That is the distinction. Not replacement. Complement.
