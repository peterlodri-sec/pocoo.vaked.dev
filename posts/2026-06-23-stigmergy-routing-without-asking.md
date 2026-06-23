---
title: "Stigmergy: routing without asking"
date: 2026-06-23
tags: [vaked, swarm, routing, distributed-systems, biology]
description: "Ants don't ask each other where the food is. They read the pheromone trail. The Vaked swarm routes compute the same way — agents query historical latency logs rather than the network."
draft: false
---

Ants are individually simple. No ant knows the colony's food map. No ant sends messages to other ants saying "the route to the sugar is 47 meters northwest." Yet ant colonies reliably find the shortest path to food and abandon longer routes as they become outdated. How?

The answer is that ants do not coordinate directly. They coordinate *through the environment*. An ant that finds food deposits pheromone on its way back. An ant that follows that trail deposits more pheromone if the food is still there. Trails that lead to good food get reinforced. Trails that go nowhere evaporate. The colony's collective intelligence is encoded not in any individual ant but in the trail system it leaves behind.

This is **stigmergy**: indirect coordination through environmental modification.

## The /reflect log is the pheromone trail

In the Vaked swarm, compute is distributed across nodes. When an agent needs to route work to another node, the naive approach is to ask: query the network, get current latency, pick the best path. This works, but it adds network overhead to every routing decision, and it has no memory — the same query is repeated every time.

The stigmergic approach: agents never ask the network directly. They query the `/reflect` log — a local, memory-mapped record of every recent network event, latency measurement, and topology shift. Routes that succeeded recently have high weight. Routes that were slow or failed have low weight. Old entries decay.

| Ant Colony | Swarm Equivalent |
|---|---|
| Pheromone trail | `/reflect` NetworkEvents |
| Trail strength | Historical latency, weighted by recency |
| Evaporation | Exponential decay of old log entries |
| Foraging ant | Sub-agent seeking a compute path |
| Trail reinforcement | Successful path → stronger log weight |

## The decay function

An entry in the `/reflect` log has a weight that changes over time:

```
weight(path, t) = success_count × exp(-age / half_life)
```

Where `age = now - path.timestamp` and `half_life` is configurable (default 24h). A path that worked twenty times yesterday is stronger than a path that worked once an hour ago. A path that has not been used in three days is nearly invisible.

Agents pick the path with the highest current weight. No network query. No blocking on a remote response. The decision is local and fast.

## What the trail encodes

The pheromone trail encodes the colony's *aggregate experience*. No single ant knows it. It emerges from the collective behavior of all the ants that have walked that route.

The `/reflect` log encodes the swarm's aggregate experience of the network. No single agent knows the full picture. It emerges from the accumulated latency measurements of every operation that has flowed through the system. When the network changes — a node goes down, a new route opens — the weights shift over the next few hours as old entries decay and new ones accumulate.

The half-life parameter is the tuning knob. A short half-life makes the system responsive to network changes but noisy. A long half-life makes it stable but slow to adapt. The right value depends on the stability of the underlying network.

## Stigmergy versus gossip

The alternative design is gossip: agents periodically exchange routing tables, averaging their views of the network into a shared state. Gossip converges to correct routing but requires all-to-all communication and has complex failure modes when partitions occur.

Stigmergy requires no direct agent-to-agent communication for routing. Each agent writes to and reads from its local `/reflect` log. The coordination is indirect: the log is the shared medium, not a shared data structure that requires consensus.

For the class of routing decisions the Vaked swarm makes — "which node should I dispatch this unit of compute to?" — stigmergy is simpler and faster. The log is already there for other purposes. The routing intelligence is free.

Ants solved this 130 million years ago. The abstraction holds.
