# 0032 — A proof reports the shared state it changed

Status: implemented

## Problem

The isolated proof removed the contamination of the tracked tree, and the caches it needs stayed shared: `.harness`, `node_modules`, and every `governance.proofCarry` path are materialized in the worktree as links to the repository's own state. A gate that writes through one of those links changes a file outside the tree under proof, and the run still reported success, so the evidence described a tree the proof had not left alone. Copying every cache was refused in 0028 as expensive and easy to get wrong, which left the gap known and unmeasured.

## Decision

`prove --isolated` records size and modification time for every file under the carried paths before the proof and compares after it. A file that was modified or removed fails the run and is named; added files are reported as cache growth, because populating a cache is what a first run after a release legitimately does. `.git` directories are skipped: the shim already fails a proof that rewrote a fetched tool's object store, and walking every object of every cached clone costs seconds where the metadata walk costs a fraction of one. `carriedState` and `carriedChanges` in [src/worktree.mjs](../../src/worktree.mjs) hold the mechanism, and `test/scan-prove.test.mjs` covers a modification, a removal, an addition, and a gate that tampers through a link.

## Alternatives

- Copy the carried state into the worktree: that is real isolation, and 0028 refuses it for cost; a per-file clone is not portable to the CI filesystem.
- Mount the caches read-only: needs privileges the harness does not have on a CI runner or a laptop.
- Hash file contents instead of metadata: it catches an adversary that restores timestamps and costs a full read of every cached file on every proof. The threat model is the repository's own gates, not hostile code.
- Warn instead of fail: a proof whose tree changed is not evidence and must not be recorded as if it were.

## Consequences

- A gate that mutates a shared cache fails its proof, which is what makes the shared link tolerable at all.
- Populating an empty cache still works and is reported, so the first proof after a clean checkout does not fail.
- The check costs about 0.4s per walk on this repository's 15k carried files, and it cannot see a mutation that restores both size and modification time.
