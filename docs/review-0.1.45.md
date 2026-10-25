# 0.1.45 — separate review and verification record

Plan: [0047](decisions/0047-integrate-and-review-before-pr.md).
Review baseline: origin/main `2e5306d`; release code `3e31450`.
The author performed a separate Bugs / Security / Compliance pass over the
source diff, tests, schema, manifests, release references and CI path.
This is a self-review record, not independent owner approval. No merge is
authorized by it. Generated releases were checked against their generators.

## Findings addressed

| Pass | Important finding | Correction and evidence |
|---|---|---|
| Bugs | A hung injected command could count as a watched failure | prove rejects timeouts/signals and still reverts; regression first returned ok |
| Bugs | prove ignored output assertions during failure and recovery | Shared assertion evaluator; regressions first returned dead/ok incorrectly |
| Security | POSIX-only containment accepted Windows parent escapes | Kernel and new standalone Pack use native separators; win32 vectors and manual old-check reproduction |
| Bugs | Stale-proof runs failed the CLI but looked green in metrics | Qualification stored in JSONL and read by both summaries; stale/bypass regressions |
| Compliance | Diverged history and duplicate change record numbers | Merge all 16 upstream commits, preserve both feature sets, renumber the local delivery record |
| Compliance | Current plan still described the first pilot | Replace current criteria/checks with this iteration; retain historical reports |

The receipt reentrancy test calls the actual gate runner twice, keeping its
output assertions while avoiding release-proof coupling in a source-tree test.
Proof freshness remains tested through the CLI. Contract text was compressed
within the existing budget; no budget or product test was weakened.

## Local verification

Full suite before release: 253 passed, 0 failed. Kernel/base 0.1.45 and
delivery-flow 0.1.1 are new artifacts; old versions remain unchanged. Self and
example pin `3e31450140ae940b42f0178c6c2205ec49a2bf0c`.
All ten isolated fault/recovery proofs passed; the current plan is also
rechecked after replacement. Final gate, cold-cache and remote CI outcomes
are attached to the exact PR head in its review, rather than guessed here.

## Residual limits

No further important finding remains from this pass. Windows coverage exercises
win32 path semantics on the local host, not a Windows machine. Context routing
requires the agent to follow when conditions; byte budgets do not measure
tokens. GitLab observation retains upstream's fake-transport qualification;
target-instance compatibility and provider artifact provenance remain unverified.
Proof worktrees borrow cache state; avoid concurrent writes to it.
The gate runner and command-name hints do not provide an execution sandbox.
No real-model calls, game E2E, owner approval, merge or deployment was performed.
Remote CI is verified separately after opening the PR.
