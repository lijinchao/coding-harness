# 0012 — Verification tiers: unit, integration, end-to-end

Status: implemented

## Problem

The base required a `## Verification` section in every change record but said nothing about what belongs there. Verification drifted toward whatever was convenient: a manual click-through reported as verification, or an end-to-end run for a change a unit test would cover.

## Decision

The base ships `skills/verification-tiers/SKILL.md`. It names three automated tiers — unit (a pure function or single module, no I/O), integration (two or more real components together), and end-to-end (the shipped artifact reached as a user reaches it) — and requires picking the cheapest tier that fails when the change is reverted. The evidence lives in the change record's `## Verification`: the exact command and the output it must produce. Manual verification is not a tier; it records the product experience no check asserts and stays recommended.

## Alternatives

- A separate evidence artifact per change: more ceremony than the change record already carries, and the observed failure was a mislabeled verification, not a missing file.
- Require an end-to-end check for every change: slow, and no more convincing than the cheapest tier that actually fails on revert.
- Say nothing and rely on the test-driven-development skill: that skill covers writing the test first, not choosing the tier that carries the evidence.

## Consequences

- A change record's `## Verification` is expected to name a command, not a claim; `doctor` still checks only that the section exists.
- The base gains a guide, not a gate: no new failure mode is added for repositories that already verify honestly.
- If mislabeled verification persists, it becomes an observed failure and can be promoted to a check on the section's content.
