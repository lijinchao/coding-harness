# 0044 — Delivery starts with an acceptance map

Status: accepted

## Problem

The repository can prove its gates fire, but its TDD skill has no per-change
acceptance map. A green suite does not identify the user outcome, missing test
tiers, baseline failure, or the human decision still needed. The game-design
repository already has Make targets, ADRs, product plans, and offline tests,
but no coding-harness pin: replacing those artifacts would create duplicates.

## Decision

Trial a standalone, dependency-free `delivery-flow` pack in this repository.
One JSON acceptance map links an existing design, constraints, scope, acceptance
criteria, exact commands, test files, and explicit tier waivers. The planned
stage validates that graph without executing product commands. Verification
reuses existing command-review receipts, checks the same tests at baseline and
candidate commits, rejects timeout-as-red, and checks the candidate scope has
not changed. Reports distinguish verified evidence from human acceptance.
A separate optional human decision binds the plan digest and candidate; the
tool never creates an approval or authenticates a reviewer by trusting a name.
Repository review remains the authority for that decision.

The repository owns a small adapter to the released pack checker. Existing
Make, pytest, Godot, npm, ADR, issue, and CI entrypoints remain the owners of
their behaviors; the pack references them. game-design is inspected and its
offline verification is run, but its code, instructions, and CI are not changed.

## Alternatives

- Add more mandatory kernel manifest fields: every repository would inherit a
  workflow before one real consumer has demonstrated its value.
- Treat a green suite or a populated reviewer field as acceptance: neither
  establishes the product judgment of the owner.
- Immediately scaffold game-design: its existing sources of truth first need
  a reviewed adoption mapping; its useful local harness must be preserved.

## Consequences

Commit this plan before implementation. The change is complete when negative
tests fail for missing behavior, the released pack passes conformance with
failure injection and revert, the self pilot reports pending human acceptance,
the full suite and example check pass, and a report names the remaining gaps.
No remote push, product feature, or claimed human approval is part of it.
The first real pack proof exposed a kernel writeback bug: `prove --record`
serialized merged contributions into the raw manifest. Fix recording and test
the adjacent pack upgrade path, then create a local 0.1.42 release/tag and move
the self/example pins to it. Populate caches from the same local tag while it
is unpublished; keep the recorded remote source unchanged. This adds a local
kernel release because continuing to pin the broken writer defeats the trial.

## Plan

1. Write and run failing tests for the acceptance graph and evidence stages.
2. Implement the pack checker, schema, and thin repository adapter; publish its
   first local hashed release and exercise it through the existing pack loader.
3. Add a self-hosted pilot and conformance journey, including deliberate gate
   failure and recovery, without changing the pinned kernel release.
   The isolated suite exposed a process-global temporary-directory assertion:
   another caller's directory was mistaken for a leak. Add deterministic
   interference to its regression test and assert cleanup of the owned export.
4. Run existing offline game-design verification and inspect its CI/entrypoints.
5. Document real findings and adoption mapping, verification output, and the
   unimplemented boundaries (execution capture, authenticated approval, metrics
   attribution, scheduled proof refresh, real-model and GUI acceptance).
