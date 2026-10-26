# 0053 — Consume the harness on current work, not only on itself

Status: accepted
Date: 2026-10-27

## Problem

Self-audit at 8f831a9 found a planned-only delivery gate still reading the prior
proof/offline task, a blocking metrics budget reading a 0.1.43 historical log,
a true-command receipt smoke that did not review real delivery commands, and
23 hard-budgeted document entries after reducing consumer burden. Shared-index
interference also showed that isolation must precede staging, not follow it.
The owner authorized repairing these self-consumption gaps. Existing real work
is sufficient observation material; no fixed three-task pilot is required.

## Decision

Keep Kernel/base/pack releases at their current immutable pins. Change only this
repository's adapters, tests, instructions and configuration; no agentic-ops writes.

1. Commit this plan, then frozen failing self-consumption tests. Replace the
   active delivery plan with criteria for this change. Use existing capture and
   pack verification on exact red/green commits, preserving test bytes. A planned
   gate remains preflight; the resulting verified report leaves acceptance pending.
2. Retain metrics as an explicitly historical diagnostic, but change its gate
   to advisory. Old-window budget breaches must not block unrelated current
   delivery. Retain the log, thresholds and deliberate budget-failure proof.
   CI's existing per-run report remains the current check-health evidence, not
   proof of productivity. No new history backend or metric semantics in Kernel.
3. Preserve the true-command smoke and binding-mismatch rejection; label it as
   mechanism-only in output and protection text. Real delivery commands get
   separate receipts in step 1, not an expanded smoke that recursively runs tests.
4. Keep all 23 declared document paths and other rules. Retain existing AGENTS.md
   (8192 bytes) and docs/index.md (4096 bytes) budgets; remove the other 21 length
   limits. Do not claim that byte limits measure tokens or that fewer limits save time.
5. Correct live direction, roadmap, SPEC and adoption guidance: observe existing
   work without a minimum task quota or new ledger. Add a local source-delta
   instruction to isolate shared writing before staging, regenerate AGENTS by sync.

## Alternatives

- Upgrade Kernel or add gates: expands machinery rather than fixing consumption.
- Block every delivery on a verified report: pure prose changes need honest
  review, not fabricated failing tests or redundant plan carriers.
- Remove history or the smoke: loses useful diagnostic/regression coverage.
- Keep the old metrics gate blocking: treats historical health as current evidence.
- Copy the consumer's four budgets: only two of our existing declarations are
  agent entry/navigation paths; preserve their actual limits, not arbitrary symmetry.

## Consequences

The metrics gate deliberately ceases blocking on old history; this is an explicit
policy correction, not a test weakened to obtain green. Gate count stays ten.
New tests enter the existing tests gate and its explicit proof_inputs. Refresh
affected proofs with the pinned tool after committing, then regenerate the derived
attestation; do not change old release contents. Run full tests/example, all gates,
strict doctor, freshness and attestation. Record receipt hashes/limits and the
human decision still pending. No live model, dependency, remote push, PR or merge.
Operator receipts observe archived tree changes, not OS-level isolation; no
network or credential sandbox is claimed. A future task must update its own
acceptance source rather than leave this plan silently governing unrelated work.
