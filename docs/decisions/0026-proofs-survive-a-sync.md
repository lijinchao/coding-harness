# 0026 — A proof survives a sync, and always attempts its revert

Status: implemented

## Problem

`sync` rebuilt the lock from scratch and dropped `lock.proofs`. Because the `harness-drift` gate's revert is `./harness sync`, the second `prove` after recording a proof deleted the proof records, left the manifest modified, and failed its own clean-tree check. Any repository with committed proofs could therefore not prove again, and generated CI on such a checkout failed. `upgrade` did the same by deleting the whole lock. Separately, a proof returned without reverting when the introduction command itself exited non-zero, and the timeout was optional, so a hung command could wait forever.

## Decision

`applySync` preserves `lock.proofs`, and `upgrade` hands the recorded proofs to it instead of discarding the whole lock: a sync or an upgrade changes the composition and the pin, and neither is a statement about whether a gate fires. `proveGate` attempts the revert on every path once the introduction has run, reports whether that revert succeeded, and the generated CI runs `prove --timeout 300` so no proof command can wait forever by default; `prove` prints a hint when it runs interactively without a timeout.

## Alternatives

- Make the harness-drift revert restore the manifest from git instead of syncing: it would hide the sync defect and make the revert disagree with what a sync produces.
- Drop proofs whenever the pin changes: silently discarding evidence is worse than keeping a timestamp a reviewer can read.
- Run every proof in a temporary worktree: untracked caches and the tool cache would be missing there, which is a larger design change and is recorded as future work.

## Consequences

- A recorded proof survives sync, upgrade, and a proof's own revert, so `prove` can run repeatedly; `test/scan-prove.test.mjs` covers `prove --record`, commit, `prove`, clean tree, and `test/gates.test.mjs` covers the upgrade path.
- A failed introduction still reverts, so a partially applied failure is not left behind.
- Git-visible cleanliness cannot see ignored files; a revert that damages an ignored build cache is not caught. That limit is documented rather than pretended away.
- The default timeout stays unlimited for local runs; CI passes one explicitly, and an interactive run is told to.
