---
title: "Compiling multi-agent topology ahead of time with MLIR"
date: 2026-06-23
tags: [vaked, mlir, compilers, multi-agent, architecture]
description: "Two MLIR dialects, three passes, and a staged adoption plan for ahead-of-time-compiling the structural guarantees a multi-agent runtime depends on."
draft: false
---

Most multi-agent runtimes discover their topology at runtime. Agents announce themselves, register dependencies, and the supervisor figures out what depends on what by watching events flow through the system. This works until it doesn't: a dependency cycle appears only when the agents that form it are all running, and by then you are already in a broken state.

Vaked takes a different approach. The state-dependency topology — which agents exist, which state each produces and consumes, which dependencies form a DAG — is compiled ahead of time. If the topology has a cycle, the build fails. If an agent tries to consume state it has no declared dependency on, the build fails. The runtime gets a pre-verified routing index and can trust it.

The mechanism is two custom MLIR dialects and three passes.

## Two dialects

The **`vaked` dialect** captures the agent dataflow graph at a high level of abstraction. Agents are structural ops. State is SSA values flowing between them. A `vaked.consume` op says "this agent takes this step's output as an input."

The **`hcp` dialect** captures the protocol mechanics one level lower. It models the write-ahead registration discipline RFC 0004 defines: before consuming state, an agent must register a `DependencyRegistration` frame into `eventd`. This makes dependency relationships observable by the event log before any computation happens. The `hcp` dialect provides ops for this: `hcp.register_dependency`, `hcp.canonical_fetch`, `hcp.rewind_scope`.

The two dialects are related by lowering. `vaked.consume` becomes the `hcp.*` write-ahead sequence. High-level dataflow intent becomes low-level protocol compliance.

## Three passes

**Pass 1 — topology analysis.** Run over the `vaked` dialect. Computes the critical path, detects cycles, enforces the `maxDepth` bound. A forbidden cycle or exceeded bound is a build error, not a runtime panic. The pass emits a diagnostic with the cycle members named.

**Pass 2 — WAL injection.** Lowers `vaked.consume` into the `hcp.*` write-ahead sequence. Every state consumption becomes a registered dependency before execution. After this pass, the HCP invariant holds by construction: the event log cannot have a consumption that was not preceded by its registration.

**Pass 3 — AOT supervisor index.** Emits the packed read-only routing table that `agent-supervisord` loads at boot. The supervisor does not discover the agent topology at runtime — it boots with a pre-computed, pre-verified index. Agent restarts, dependency tracking, and rewind scopes are all wired before any agent runs.

## Staged adoption

The architecture is sound but the implementation is staged, and the staging matters.

Stage 0 (shipped): the three passes run as Python passes over the typed semantic graph inside `vakedc`. No MLIR dependency. The same structural semantics — DAG enforcement, write-ahead injection, supervisor index emission — are implemented against the existing Lowered Property Graph. This stage proves the semantics without taking on the MLIR toolchain as a dependency.

Stage 1 (planned, with compiled agents): the real `vaked`/`hcp` MLIR dialects land when agent binaries are AOT-compiled. The Stage-0 Python passes become the **reference semantics** the Stage-1 MLIR verifier must match: same typed graph in, same structural verdict out. If they disagree, the Stage-1 MLIR implementation is wrong.

What never moves into MLIR: `eventd`, the memory store, the Zig enforcement daemons, the OTP control plane. Those are dynamic I/O systems. MLIR compiles the topology they run on, not the runtime itself.

## Why this matters

The standard critique of ahead-of-time approaches is that real systems are dynamic — agents come and go, topologies change. This is true. The Vaked answer is topology epochs: the compiled index carries a monotonic version number. When topology changes, a new epoch is compiled and the supervisor transitions. Between epoch boundaries, the compiled guarantees hold.

The tradeoff is real: you cannot add a new agent without a recompile. For the class of systems Vaked targets — declared, typed, auditable multi-agent infrastructure — this is the right tradeoff. The guarantee that no cycle exists and no agent consumes unregistered state is worth the constraint.
