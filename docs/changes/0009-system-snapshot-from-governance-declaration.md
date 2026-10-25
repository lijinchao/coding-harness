# 0009 — Materialize a reviewed system declaration outside the governance repository

## Context

A governance repository cannot commit a system manifest that pins its own
containing commit: changing the manifest changes that commit. The existing
`system-check` correctly requires exact revisions, so the declaration and the
qualified snapshot must be different artifacts.

## Plan

1. Keep a reviewed `coding-harness.system/v1` declaration in the governance
   repository with `revision: null` for members whose revisions will be bound
   for one change. Do not infer or approve a revision from a checkout.
2. Add `system-snapshot` with `--manifest`, repeatable `--bind
   <id>=<full-sha>`, and `--out`. Require an explicit revision for every null member,
   reject duplicate/unknown bindings, verify all declared repositories are
   clean and at those exact revisions, and rebase paths to the output location.
3. Write the pinned snapshot only outside all declared repositories, never
   overwrite an existing file, and run the existing `system-check` before
   writing. Keep reviewed commands and contract evidence unchanged.
4. Cover the self-reference case, drift, dirty checkout, unknown/duplicate or
   missing binding, invalid output location, and CLI behavior with fixtures.
   Document that this is a snapshot builder, not Owner approval or a shared
   Change ID ledger; the existing receipt/CI path remains authoritative for
   executed evidence.

The `--bind` name avoids changing existing `command-review --revision` semantics.
The implementation uses exclusive file creation rather than the general
atomic-overwrite helper, and resolves the output directory before checking
repository boundaries so a symlink cannot redirect output into a member. It
does not add Change ID fields to the manifest: the shared change ledger needs
a separate ownership and evidence contract after snapshot qualification.

## Verification

- `node --test test/system.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`
- Inspect Git status so unrelated `.DS_Store` remains untouched.

Result: `npm test` 201/201, `doctor: ok`, and example `check` reports two
matching compositions. These are local tests of the tool, not a real
QIHOOAgent system qualification or a published tool release.
