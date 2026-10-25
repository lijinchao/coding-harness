# 0050 — A proof requires every stage to finish normally

Status: accepted
Date: 2026-10-25

## Problem

Pre-merge review reproduced a false proof: the recovery command timed out,
handled SIGTERM and exited zero, yet prove returned ok. Only the injected
check rejected timeout/signal explicitly. Setup, injection and revert also
used exit code alone, so they require the same audit.

## Decision

Add process-level regressions first for initial setup, injection, injected
check, revert, post-revert setup and recovery. Cover timeout with exit zero
and signal termination. Reject abnormal completion in every stage, preserve
the attempt to revert after injection, and add a CLI regression proving that
a failed recovery cannot create a proof record. Keep ordinary proof behavior.

Publish immutable base/tool 0.1.47, upgrade self/example with the released
tool, refresh all isolated proofs and attestation, and review the exact PR
head. User authorization now permits release and merging PRs #3 and #4 in
dependency order when the fixed stack and main CI pass. Do not self-approve,
force-push, modify old releases, or change agentic-ops in this iteration.

## Alternatives

- Check recovery alone: leaves the same incomplete-stage problem elsewhere.
- Treat exit zero as completion: SIGTERM cleanup handlers invalidate that assumption.

## Consequences

Integration tests must fail on the old implementation for the affected
stages and pass after correction; existing timeout/assertion tests remain.
The released CLI must refuse recording a recovery-timeout proof. Full tests,
pinned example, strict doctor, proof freshness and attestation must pass.
No model calls, dependencies, new gate declarations or sandbox claims.
