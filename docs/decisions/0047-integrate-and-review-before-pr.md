# 0047 — Integrate current upstream and verify the proposed delivery

Status: accepted

## Problem

The local delivery/context pilot and upstream main diverged. Upstream contains
collaboration and self-governance corrections that a PR must preserve. Context
containment currently assumes POSIX separators, and publication needs a cold
checkout check rather than relying on populated local caches.

## Decision

Create a codex/ integration branch, merge current origin/main without rewriting
existing commits or tags, and reconcile overlapping schema/CLI/governance
changes. Preserve both feature sets and follow upstream gate/proof policy.
Write failing regressions for any confirmed boundary or integration failures,
then fix them. Publish a new immutable local release (0.1.45 or the next unused
version), upgrade self/example, run all gates, isolated proofs and attestation.
Keep unrelated game-design product work outside this PR.

Review the complete PR diff in a separate Bugs/Security/Compliance pass, fix
important findings, and record review scope, evidence and residual limits.
The author must not approve their own PR. Push the branch and exact required
release refs, create a PR to main, and verify its actual head with cold-cache
and remote CI checks. Do not merge or enable auto-merge.

## Alternatives

- Force local main over upstream: discards independent work.
- Rebase existing release history: invalidates pinned commits and artifacts.
- Ship only documentation: leaves reproduced runtime defects unresolved.

## Consequences

The PR includes previously local delivery/context work and explicit integration
fixes. Runtime dependencies remain zero. Publication is authorized by the user;
review/verification are evidence, not owner approval. Preserve release artifacts
and distinguish passing local checks from actual remote CI results.

The confirmed timeout-as-proof defect must reject interrupted injection runs
after restoring their state. Apply portable containment to the standalone
delivery Pack too, under a new Pack version. Gate reports must retain proof
failures so the same metrics window cannot report a stale-proof run green.
The receipt reentrancy regression exercises runGates directly; CLI proof
freshness remains separately enforced and tested. Compress merged documentation
instead of raising its existing budget.
Proof failure and recovery must use the same forbidden-output assertions as
gate execution, not only command exit codes.
