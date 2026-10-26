# Repair actual self-consumption, without a new Kernel feature

Decision: docs/decisions/0053-consume-the-harness-on-current-work.md

## Context

This is real coding-harness product work, not another prerequisite pilot.
The active acceptance map replaces the historical proof/offline task. Planned
remains preflight. Frozen policy tests and the real adapter CLI will supply
revision-bound red/green receipts, separate from the true-command mechanism smoke.
All 23 document declarations remain, with only AGENTS/index byte budgets retained.
Historical metrics becomes explicitly advisory; current CI health uses its run
report. No consumer repository, Kernel/base/pack release or dependency changes.
Shared writing instructions now require isolation before staging.

## Verification

Initial targeted tests: 0 pass / 5 fail. Refined the frozen tests before the
implementation commit so a future active task is not forced to retain this
task's id or an exact document count. The final frozen baseline is 3dbe05e;
the archive replay will verify its actual failures. Local candidate: 5/5 pass.
The new test is registered in the existing tests gate's proof_inputs.

Strict doctor passed. prove --check correctly rejected changed tests and
command-review inputs; it was not bypassed. Remaining checks: affected fault
proofs, complete tests/example/gates, attestation and exact-revision receipts.
This record is outside the explicitly listed implementation scope so recording
receipt results does not pretend that a receipt can hash its own future report.
The final report must name the exact implementation candidate; evidence does not
qualify unrelated files or grant human approval.
