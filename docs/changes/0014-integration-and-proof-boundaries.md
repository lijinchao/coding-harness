# Integrate upstream and qualify proof boundaries

decision: docs/decisions/0047-integrate-and-review-before-pr.md

## Verification

The branch merges origin/main's 16 commits without rewriting its history.
Preserved features include foreign-harness discovery, materialized system
snapshots, shared change/baseline coverage, GitLab observation and policy,
provider scaffolds, executable product inventory, help handling, and gates'
proof-freshness enforcement.

Failing regressions demonstrated that timeouts could count as injected failures,
forbidden-output assertions differed between prove and gates, and stale-proof
runs appeared green in metrics. The fixes restore before refusing interrupted
proofs, share output assertions and carry proof qualification into both metrics
views. Old logs retain their prior interpretation; explicitly skipped proof
checks do not qualify a new report as green.

Containment now uses native path separators in context and standalone Pack
code; win32 path vectors cover parent, sibling and drive escapes. The old
POSIX check accepted a win32 relative parent path in a manual reproduction.
delivery-flow 0.1.1 is a new immutable release; 0.1.0 remains unchanged.

The reentrancy regression exercises the actual gate runner twice without
coupling a source-tree test to release-bound proof metadata. CLI proof policy
still has its own fail-closed regression. Contract prose was compressed to fit
the existing budget. Final release, cold-cache, PR and remote CI evidence are
recorded in the separate review report after execution.
