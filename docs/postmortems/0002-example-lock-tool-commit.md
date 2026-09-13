# 0002 — The example lock pinned the wrong tool commit, twice

## Impact

Main's harness CI failed on the `example` gate twice while moving the pin: once at 0.1.28 because the example was not re-recorded at all, and once at 0.1.29 because it was re-recorded with `node bin/harness.mjs` while HEAD was still the previous commit. In both cases the failure appeared after the pin commit was pushed, and `main` was red until a follow-up commit landed. No consumer was affected; the repository's own contract was.

## Root cause

`applySync` records the running tool's commit in `lock.tool.commit`. The released tool is the clone at `.harness/tool/v<version>`, checked out at the commit the tag points to, so a re-record through `./harness` writes the released commit. Re-recording through `node bin/harness.mjs` runs the working tree instead: at that moment HEAD was the commit before the release, so the example lock recorded `d32cd56` while the released tool is `f3dd5d2`. The gate command does not read that field, so `gates` passed; only `prove` noticed, because the `example` gate's revert is `./harness sync`, which rewrote the lock and left the worktree dirty.

## Response

Re-recorded the example with the pinned `./harness`, which changed only `lock.tool.commit`. The delta's re-record command now names the pinned tool and the order — release, commit, move the pin, then re-record — and lists the working-tree re-record under what the agent gets wrong.

## Regression test

Regression: example

The `example` gate is the check that caught both incidents: it runs `check` and `validate` against the example consumer, and the isolated proof of its revert fails when the lock and the released tool disagree.

## Action items

- Teach `check` the one fact this incident turned on: when a manifest declares `tool.commit`, fail when `lock.tool.commit` disagrees with it, and let `applySync` record the declared pin rather than the ambient checkout. That closes the gap for every pinned repository and needs a release of its own.
- Keep the `example` gate's revert on `./harness sync`: restoring from git would have hidden the disagreement instead of reporting it.
