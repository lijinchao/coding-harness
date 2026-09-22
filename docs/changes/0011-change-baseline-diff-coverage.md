# 0011 — Bind Change ID records to actual cross-repository diffs

## Context

The current `change.records` check proves that records exist at pinned commits,
but not that they describe the changes between an agreed baseline and those
commits. A governance snapshot can appear complete while an affected member
has no record, or while a record is only old text. `reviewed_by` is a string,
not authenticated multi-person approval.

## Plan

1. Add optional `change.bases` with one explicit full Git commit per system
   repository. Keep old Change ID declarations valid when `bases` is absent.
   Reject duplicate, unknown, or missing members and malformed revisions.
2. For each member, require the base to exist and be an ancestor of the pinned
   revision. Compute changed paths from Git commits only, without running repo
   code. When any member changed, require its Change ID record, and require
   that record path itself changed in the same range. Unchanged members need
   no record; a declared record on an unchanged member fails closed.
3. Report per-repository baseline, diff availability, and changed paths through
   `system-check`. Apply the same readiness check to `system-snapshot`,
   `system-run`, and `system-ci`; surface concrete CI problems.
4. Test mixed changed/unchanged members, unrecorded changes, stale record,
   non-ancestor/missing baseline, schema parity, and self-inclusive snapshot.
   Explain that diff coverage is an objective prerequisite to review, not
   identity authentication or approval.

## Verification

- `node --test test/system.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`

Result: focused system tests 36/36, `npm test` 209/209, `doctor: ok`,
example `check` reports two matching compositions, and `git diff --check`
passes. The optional field preserves identity-only checks for older Change ID
snapshots. No real multi-repository system was enrolled or qualified, and no
external command or authenticated review was performed.
