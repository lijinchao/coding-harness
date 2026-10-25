---
name: writing-a-gate
description: Use when adding or changing a gate in the coding harness.
---

# Writing a gate

A gate enforces a rule without judgment, or routes the decision to a person.

## Inputs

- The invariant the gate protects, in one sentence.
- The command that checks it.
- The manifest entry the gate will occupy.

## Steps

1. Name the invariant the gate protects, in one sentence.
2. Write the command that checks it. Keep it under a second for the build phase; move anything slower to CI.
3. Write `prove_fires`, the action that must make the gate fail:
   - introduce the failure on purpose;
   - run the command and confirm it exits non-zero;
   - revert the failure and confirm it exits zero.
4. Add the gate to `harness.manifest.json` with `id`, `command`, `protects`, `prove_fires`, and `severity`.

## Verification

`harness validate` accepts the gate, and the `prove_fires` action exited non-zero in step 3.

## Failure

If the gate does not fire in step 3, the gate does not work. Fix it before adding it. A gate whose `prove_fires` action was never run is a dead gate; delete it.
