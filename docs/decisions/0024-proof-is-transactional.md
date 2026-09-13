
Status: implemented

## Problem

`harness prove` ran the manifest's `prove_fires_command` and `revert_command` directly. When a revert was `git checkout -- <file>`, uncommitted work in that file was destroyed while the tool reported success. The commands also ran without a timeout, so a hung proof hung the tool.

## Decision

A proof refuses to start unless `git status --porcelain` is empty, refuses to report success unless the tree is clean again after the revert, and runs every command through the gate runner's process-group machinery with `--timeout`. A proof in a directory that is not a git working tree is refused, because the revert cannot be verified. `--record` still writes the manifest after the proof, so the recorded proof is committed afterwards.

## Alternatives

- Snapshot and restore every file: a shell command can touch any path, so the snapshot has no boundary cheaper than the working tree itself.
- Run in a scratch worktree: untracked build artifacts and tool caches are missing there, so gates would fail for reasons unrelated to the proof.
- Keep the old behavior and document the hazard: silent data loss is not a documentation problem.

## Consequences

- An uncommitted change can no longer be destroyed by a proof; the tool tells the user to commit or stash instead.
- A revert that does not restore the content — `touch` instead of the original bytes — fails the proof. This change caught exactly that in its own test fixture.
- A repository without git cannot prove its gates; the harness already assumes git for the tool pin and for upgrades.
