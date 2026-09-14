# 0039 — Autonomy is a declared level with a condition to pass

Status: proposed

## Problem

The kernel measures whether rules hold, and [0038](0038-an-eval-measures-delivery.md) will measure whether tasks get delivered, but nothing says how much an agent may do without a human. Teams choose one of two failures: trust early — one prompt, a large diff, no external assertion, a merge nobody reviewed — or trust never, where every step waits for a person and the loop never runs. Neither is recorded anywhere, so a repository cannot say which level is in force, what justifies it, or what would have to change for the next one.

## Decision

A repository may declare its level:

```json
"autonomy": { "level": 3, "allowed": ["read", "edit", "open-pull-request"], "requires": ["eval/fix-reward"] }
```

`level` is a step on one ladder, and each step has a condition that the repository itself carries as a check — never as prose:

| Level | Allowed | The condition to pass |
|---|---|---|
| 0 | declare adapters | `validate` accepts the declaration |
| 1 | start and stop the application | one repository gate runs `start` → `ready` → `teardown` and passes |
| 2 | finish a single task | one eval declares an external assertion and its evidence is present and non-empty |
| 3 | run that task in CI | the eval's run reaches the `delivery-outcome` window and meets its declared budget |
| 4 | open a repair PR unattended | the level-3 budget has held over the declared window |
| 5 | merge | the change size and rollback rate at level 4 stay inside their budgets |

The harness validates the declaration statically: the level is in range, every `allowed` id is known (`read`, `edit`, `open-pull-request`, `merge`), and every `requires` entry names an artifact that exists — an eval id or a budget kind. It never grants autonomy, never merges, never hosts the agent, and never accepts a level as proof of itself: raising the level is a commit, so the ladder and the evidence that justified each step live in the same history.

## Alternatives

- A single `autonomy: true`: it records a feeling, not a condition, and it cannot be audited after the fact.
- Treat a green CI as the gate for every level: green tests say the rules held, not that a task was delivered — the confusion [0038](0038-an-eval-measures-delivery.md) exists to prevent.
- Leave it to the platform's merge permissions: the real control becomes invisible in the repository, and nobody can see why an agent was trusted.

## Consequences

- A level claim is worth exactly its `requires`: a claim that names nothing checkable is rejected by validation, and a claim whose condition fails is a red gate, not an opinion.
- Levels 4 and 5 need signals the harness does not collect yet — change size and rollback rate — so they are declared here and unenforceable until a repository records those runs.
- This is `proposed`: no key, no schema, and no check exist yet. The first repository that claims level 2 and can show its evidence is what turns the ladder into an instrument.
