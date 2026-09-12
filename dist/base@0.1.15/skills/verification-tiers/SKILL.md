---
name: verification-tiers
description: Use when deciding which check proves a change, or recording its verification.
---

# Verification tiers

Automated verification has three tiers. Manual verification is a separate, product-experience record; it is not a fourth tier and does not replace one.

## Inputs

- The change and the behavior it can break.
- The checks the repository already runs.
- The change record's `## Verification` section.

## Steps

1. Name the behavior the change affects and the cheapest tier that would fail if the change were reverted:
   - **Unit** — a pure function or a single module, with no I/O.
   - **Integration** — two or more real components together, such as a service and its store.
   - **End-to-end** — the shipped artifact exercised the way a user reaches it.
2. Prefer the cheapest tier that actually fails on revert. Do not reach for end-to-end when a unit test covers the behavior, and do not claim a unit test covers a seam it never crosses.
3. Run the chosen check and capture the exact command and the observed output.
4. Write both into the change record's `## Verification`: the command, and the result it must produce.
5. If the change is about the product experience rather than a behavior a check can assert, record it as manual verification instead, and still add the automated check that will carry the lesson forward.

## Verification

The change record's `## Verification` names a concrete command and the output it produced, and the command fails when the change is reverted.

## Failure

If no tier fails on revert, the change has no automated evidence. Add the missing check, or state plainly in the change record that the change is unverified and why that is acceptable.
