# Manual verification — the operator journeys

The harness has no end-user screen. Its product experience is the operator journey, and these three must work end to end.

## Target

A repository owner adopting the harness: first-time setup, then a base release, then a proof.

## Task

1. `init` a consumer, customize its delta, `check` it, `prove --record`, then `prove`.
2. `release` a new base, `upgrade` a consumer, `prove`, and let CI run the same list.
3. `prove --record`, commit, `prove` again, and confirm the working tree is clean.

## Observation

- 2026-09-13, base 0.1.27: journey 3 passed by hand on `coding-harness` and `codex-inspired-agent` — `prove` reported four gates `ok` and `git status` was clean afterwards. Journeys 1 and 2 are covered by `test/journeys.test.mjs`.
- The failures found in this session — a repeated `prove` deleting recorded proofs, `upgrade` dropping them, and the lock key order drifting — were found by running journeys 2 and 3, not by the unit tests that existed at the time.

## Decision

Keep the three journeys executable. When one changes, update this record and its test together; a journey that lives only here is already decaying.
