# 0030 — The lock records the pin, not the checkout

Status: implemented

## Problem

`lock.tool.commit` was whatever commit the running tool's checkout happened to be at. For a manifest that declares `tool.commit` the two agreed in practice, because a sync refuses to run from another build; for a manifest that declares only `tool.version` — the example consumer — the lock recorded the ambient checkout. Re-recording the example from a working tree one commit behind the release wrote `d32cd56` into a lock whose tool was `f3dd5d2`. Nothing read the field, so `check` passed, and the disagreement surfaced only when the `example` gate's revert re-synced the lock inside a proof worktree and left the worktree dirty (postmortem 0002).

## Decision

`applySync` records `manifest.tool.commit` when it is declared, and the running checkout only when it is not, so the lock states the pin rather than the place the tool was run from. `harness check` and `harness scan` compare `lock.tool.commit` against the declared pin and fail with `run harness sync` when they disagree. The example consumer declares the commit of the release it was recorded with, so re-recording it with another build fails at the pin check instead of writing a lock no release contains.

## Alternatives

- Delete the field because nothing read it: it is the lock's record of which build produced the composition, and removing evidence because it is unread removes the chance to notice.
- Record the ambient checkout always: that is exactly what let the example lock name a commit no release has.
- Refuse a sync whose lock disagrees: a sync is what repairs the lock, so refusing there would leave no in-band way to fix it.

## Consequences

- A lock written by another build, hand-edited, or left by an interrupted release is a `check` failure instead of a silent fact.
- The example's pin adds `--tool-commit <released commit>` to the documented re-record command; forgetting it fails before anything is written.
- A manifest that pins `tool.version` without `tool.commit` still records the ambient commit, and [reference.md](../reference.md) states that a moved tag goes undetected there.
