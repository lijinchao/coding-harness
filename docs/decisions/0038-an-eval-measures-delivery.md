# 0038 — An eval measures delivery, and it is not a gate

Status: proposed

## Problem

Every mechanism the kernel has answers the same question: does a declared rule still hold? A gate proves a rule fires; a proof says the gate was watched to fail and pass; the metrics window reports how often the gate list came up green. None of that says whether an agent can actually deliver — reproduce a bug, fix it against a real application, and show that the world changed. Without a task contract, "the agent works" is demonstrated by anecdote, and the first two layers of [direction.md](../direction.md) measure only their own health.

## Decision

An eval is a declared task with six parts: the **fixture** that builds the world, the **task** given to the agent, the **world assertion** — a command whose exit code is the evidence, run outside the agent — the **evidence** path it writes, the **feedback** the agent is shown when the assertion fails, and the **retry limit**. A repository declares evals beside its gates, and `harness eval --manifest <path> [--record]` runs them through the legibility adapters of [0037](0037-legibility-is-a-declared-contract.md): `reset` before each attempt, `start` and `ready` to bring the world up, the assertion afterwards, `teardown` at the end.

Eval runs are recorded into the same metrics log as gate runs, distinguished by `kind`: `gate-health` and `delivery-outcome`. One budget never averages the two, because a gate that flakes and a task the agent cannot finish are different failures with different responses. A run records the task id, the outcome, the attempt count, the duration, the human interventions, and the state the attempt left behind.

An eval is deliberately **not** a gate. A gate must be watched to fail deterministically and is proven once; an eval measures a rate over attempts and fails against a declared budget (a first-pass floor, a retry ceiling, a regression against its own history). The harness runs assertions; it never hosts the agent, never talks to a model, and never accepts the agent's own summary as evidence — the assertion is external and re-runnable, the rule the proof system already applies to itself.

## Alternatives

- Keep eval results outside the repository: numbers in a dashboard that no commit pins are the state this project replaces with files.
- Express evals as gates: a deterministic failure injection cannot express "the agent failed this task twice", and forcing it would produce a gate that lies.
- Let the harness drive the agent: it would have to own a model, a prompt, and a sandbox, which is a product, not a control plane; the harness supplies the task contract and the assertion, the repository supplies the agent.
- Trust the agent's transcript as evidence: rejected above, and it is the failure mode that makes self-graded evals worthless.

## Consequences

- Evals depend on [0037](0037-legibility-is-a-declared-contract.md) being real in at least one repository; until an adapter set actually starts an application, an eval has no world to assert on.
- The metrics window gains a `kind` and a per-kind budget, and the existing `minFirstPassRate` must not silently start mixing gate runs with task runs.
- The status is `proposed`: no key, no command, and no run schema exist yet. The first repository that records one real eval — fixture, agent attempt, external assertion — moves it to `implemented`.
- The contract invites over-claiming: a task is easy to declare and hard to assert. The world assertion is the part that decides whether the eval means anything, so it is the part the record names first.
