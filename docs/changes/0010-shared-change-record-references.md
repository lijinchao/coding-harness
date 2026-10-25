# 0010 — Bind cross-repository snapshots to local Change ID records

## Context

`system-snapshot` pins revisions, but a global governance declaration cannot yet
name the same change across participating repositories or check that each
repository owns a record at its pinned revision. The governance repository must
reference local decisions, not copy them.

## Plan

1. Add optional `change: { id, records: [{ repository, path }] }` to the system
   manifest. Require a safe single-line Change ID, non-empty unique repository
   references, known members, and repository-relative record paths. Keep the
   field optional so existing system manifests and receipts remain valid.
2. `system-check` reads each record from the declared Git commit, not from an
   untracked/ignored worktree file. Require a regular tracked file containing
   a line `Change-ID: <id>`. Report each record and fail readiness on missing,
   unsafe, or mismatched evidence. `system-snapshot` uses the same check.
3. Include the Change ID in new tier receipts and require exact equality when
   checking against a changed manifest. Legacy snapshots without `change`
   continue to produce and accept receipts without a Change ID.
4. Surface change-record failures in `system-ci`; add fixture tests for success,
   mismatch, wrong commit, ignored/untracked file, schema parity, and receipt
   tampering. Document that this proves reference consistency, not authentic
   approval, business correctness, or multi-person review.

## Verification

- `node --test test/system.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`

Result: `npm test` 206/206, `doctor: ok`, example `check` reports two
matching compositions, and `git diff --check` is clean. The focused system
suite is included in the full run. Change-specific details live in
`docs/system-change.md` to respect the existing documentation word budgets.
No real multi-repository system was enrolled or qualified; no external command
was run. The records bind identity, not human approval.
