# 0028 — A proof can run in an isolated worktree

Status: implemented

## Problem

Decision 0024 made a proof transactional in the working tree, and 0026 kept it repeatable, but the working tree was still where the proof ran. The cleanliness contract sees only git-visible files, so a gate's revert that damages an ignored build cache is invisible (0024 records that limit), and generated CI runs `gates` and then `prove` in one checkout, so a proof inherits whatever the gates left behind. 0026 declined a worktree because the tool cache and `.harness` would be missing outside the working tree.

## Decision

`harness prove --isolated` runs the proof in a temporary `git worktree` instead of the working tree, created under the system temporary directory from the repository's own object store. It symlinks the untracked state a proof needs — `.harness`, `node_modules`, and every path declared under `governance.proofCarry` — into the worktree, which answers 0026's objection for the paths a repository names. A carried directory is materialized as a real directory whose entries are symlinked, not as a symlinked directory: a gitignore rule such as `node_modules/` matches a directory rather than a symlink, so a linked directory would surface as an untracked file to a gate that lists them. Generated CI proves with `--isolated --timeout 300`.

## Alternatives

- Keep proving in the working tree and document the ignored-cache limit: that was the status quo, and the limit is real rather than theoretical.
- Copy the checkout to a temporary directory instead of a worktree: copying caches is expensive and easy to get wrong, while `git worktree` provides the committed state for free.
- Make isolation the default: an interactive proof against the working tree is sometimes the point, because the developer wants `git status` to show what the revert did; the flag keeps the default honest and the mode explicit.
- Prove in a fresh clone or a container: that needs the network and a full fetch, where a worktree reuses the local object store.

## Consequences

- `test/scan-prove.test.mjs` covers the mode: a proof whose introduction dirties the worktree leaves the main checkout clean.
- The first acceptance run on `codex-inspired-agent`, whose authorization gate asserts that no untracked file exists outside an allowlist, failed exactly on this: `.harness` was carried as a symlink and `git ls-files -o --exclude-standard` reported it inside the worktree. `test/scan-prove.test.mjs` now asserts that an isolated worktree reports no untracked path while its carried cache stays readable.
- A base source that is a relative path outside git cannot resolve inside the worktree, so `--isolated` refuses that source with a clear message instead of failing obscurely.
- A gate runs with the same repository content but a different working directory; a gate that depends on an untracked path not named in `governance.proofCarry` fails there and names the gap.
