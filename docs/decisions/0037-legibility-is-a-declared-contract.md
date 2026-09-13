# 0037 — Legibility is a declared contract the repository implements

Status: proposed

## Problem

The kernel makes rules checkable and the proof system keeps them honest, but an agent working from a worktree still cannot see the application it is changing. There is no declared way to start it, to know it is ready, to read what it logged, to look at the screen or a metric, to reset state between attempts, or to shut it down. Every repository that needs this invents it privately, so nothing portable can rely on it — a web-evidence pack has no target to write against, and a behavioral eval has no way to observe the world it asserts on.

## Decision

A repository may declare `governance.legibility`: a set of adapters, each a single-line shell command that runs from the repository root, plus the path it writes its evidence to.

| Adapter | The question it answers |
|---|---|
| `start` | How does a fresh worktree bring the application up? |
| `ready` | How is "actually ready" decided, rather than "the process started"? |
| `observe.ui` | Where does a screenshot or DOM snapshot land? |
| `observe.logs` | How are structured logs queried? |
| `observe.metrics` | Where do the numbers come from? |
| `observe.traces` | Where does a request's trace land? |
| `reset` | How is deterministic state restored between attempts? |
| `teardown` | How are ports and child processes released? |

Validation is static and environment-free: adapter ids are known, commands are single-line, evidence paths stay inside the repository, `start` and `ready` are declared together, and `teardown` requires `start`. The harness declares and validates the contract. It never implements an adapter, never launches a browser, never starts a metrics store, and never asserts on application behaviour: that belongs to the repository's own gates, and later to evals.

## Alternatives

- Ship adapters inside packs: they would assume one stack's ports, tooling, and CI images, which is the product-fact leakage packs exist to prevent. A pack may target the contract — a web-evidence pack writes gates against `start`, `ready`, and `observe.ui` — but the commands stay the repository's.
- Make legibility a gate that runs `start` in CI: it needs an environment the harness cannot supply on every runner, and a check that fails without one teaches repositories to declare nothing.
- Skip the contract and let each repository document its own: that is today's state, and it is why nothing portable can rely on it.

## Consequences

- The contract is checkable without an environment, so it can be adopted before any repository can actually run the adapters; the first repository that runs them end to end is what turns it from a declaration into practice.
- A repository that declares it takes on a real obligation: the adapters are what its future evidence gates and evals will use, so an adapter that lies ("ready" when the port is not listening) produces false confidence rather than a failure.
- This is `proposed`: no key, no schema, and no validation exist yet, and the decision's own rule forbids claiming otherwise.
