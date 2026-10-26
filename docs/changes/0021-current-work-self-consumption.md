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
archive replay confirmed actual policy and operator-preflight failures. Local
candidate: 5/5 pass.
The new test is registered in the existing tests gate's proof_inputs.

Strict doctor passed. prove --check correctly rejected changed tests and
command-review inputs; it was not bypassed. Exact-revision capture follows the
committed proof/attestation candidate below.
This record is outside the explicitly listed implementation scope so recording
receipt results does not pretend that a receipt can hash its own future report.
The final report must name the exact implementation candidate; evidence does not
qualify unrelated files or grant human approval.

First full run: 295 pass / 2 fail. The workflow generator equality test caught
our cosmetic edit of a generated step name; withdraw it, retaining the assertion.
The manual-worktree offline fixture also returned null status at its five-second
deadline while full suites ran concurrently. Resource contention is a hypothesis,
not a demonstrated cause; rerun it independently, then serialize final checks.
The isolated tests proof failed after revert and did not record a replacement.

## Final delivery checks

Independent `HARNESS_OFFLINE=1 node --test test/offline.test.mjs test/workflow.test.mjs`:
5 pass / 0 fail, without changing fixture deadlines or assertions.
Serialized `./harness prove --manifest harness.manifest.json --gate <id>
--isolated --record --timeout 300 --offline` for tests, command-review, metrics:
each injected failure fired and normal recovery passed. Only affected proofs
were refreshed; the seven other records were retained.

`./harness gates --manifest harness.manifest.json --offline --report
.harness/self-consumption-gates.XXXXXX.jsonl`: 10/10 gates passed, npm test
297 pass / 0 fail, proofs_checked=true, proof_problems=[]. The newly created
report contains exactly one run; its literal X filename is a local artifact,
not a promise that this template is portable unique-name generation.
`./harness metrics --log .harness/self-consumption-gates.XXXXXX.jsonl --offline`:
1 run / 1 green. Historical 0.80 is separately labeled, never described as this
delivery's health or a productivity gain. Metrics remains advisory.

Example check: 2 compositions match 0.1.49; strict doctor: ok; prove --check:
10 current, 10/10 input declarations. `./harness attest --manifest
harness.manifest.json --example examples/consumer/harness.manifest.json --offline`
regenerated the derived snapshot; --verify succeeds. No old base/pack/tool release
was edited. Logs: `/tmp/harness-self-repair-gates.log` and the three
`/tmp/harness-self-proof-*.log` failure/recovery logs.

## Exact-revision delivery evidence

```sh
node scripts/capture-delivery-pilot.mjs \
  --baseline 3dbe05ed44cab69dde01418cc1aa61f594a869e2 \
  --candidate 4be1de655e411f59ba4263ea3d3fdba094329f8f \
  --out /tmp/harness-self-delivery.zpMfX0
```

Both policy and real adapter-preflight commands failed with exit 1 at baseline
and passed with exit 0 at candidate, without timeouts or candidate-tree mutation.
The same test file at both revisions has SHA-256
`b5a9309a3da1d7313db3508c9c56bd6d33c1f04d3076db1f4973a7ea4fd59797`.
The released pack validated expected red diagnostics and receipt bindings:
status=verified, AC-CURRENT/AC-POLICY evidence=verified, problems=[],
human_decision=pending, authorizes_merge=false.

Report: `/tmp/harness-self-delivery.zpMfX0/delivery-report.json`, SHA-256
`4c2a9d5c99dd5fca34f3a631585ba4e3443b11985121c4853e849b3219545e0b`;
plan SHA-256 `2ddb3f8ff1ad8ccc12111e4f270b8dd935f1d5efdf441a54158ce5b8162fc42e`.
Receipts and hash-bound red stdout/stderr live alongside it. This reuses the
existing capture/checker; it is not a new ledger or a synthetic true-command
delivery result. The unit tier is explicitly waived for this configuration/adapter
slice; existing whole-suite unit coverage remains. The CLI check qualifies
this preflight adapter, not every product operation.

Final recording changes only this out-of-scope change record. The report binds
the exact implementation candidate above, not future documentation or unrelated
source files. Raw local artifacts are not hosted CI archives; this task made no
remote push, PR, independent approval or merge.
