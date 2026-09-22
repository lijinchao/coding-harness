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
2. Add `system-snapshot --manifest <declaration> --revision <id>=<full-sha>
   ... --out <path>`. Require an explicit revision for every null member,
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

## Verification

- `node --test test/system.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`
- Inspect Git status so unrelated `.DS_Store` remains untouched.
