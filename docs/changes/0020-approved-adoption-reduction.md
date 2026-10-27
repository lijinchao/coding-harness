# Implement the approved A/B consumer adoption reduction

Decision: docs/decisions/0052-evidence-first-delivery.md

## Context

Owner approved the bounded A/B proposal. Producer direction, roadmap and plan
now distinguish this implemented adoption adjustment from future product tasks.
No Kernel, schema, base, pack, producer budget or release change. Consumer
decision 0031 and change record 0050 own the local settings and evidence.
All 104 document declarations remain; 100 non-entry budgets are removed;
four entry budgets and all gate/proof/CI protections remain. Reuse-first guide
text replaces automatic gate proliferation without changing gate commands.

## Verification

`HARNESS_OFFLINE=1 node --test test/documents.test.mjs`: 5 pass / 0 fail.
`HARNESS_OFFLINE=1 npm test`: 292 pass / 0 fail.
`./harness check --manifest examples/consumer/harness.manifest.json --offline`:
2 compositions match 0.1.49. Strict doctor, ten current proofs and the existing
0.1.49 attestation pass; no proofs or attestations are rewritten.

Consumer disposable configuration tests first yielded 6 pass / 2 fail, then
8/8 after the change. The test compares the whole parsed manifest with a baseline
transformed only at approved budget keys. Existing checker fixtures preserve
missing-path, broken-link, entry-limit and forbid rejection. The temporary tests
are one-time acceptance evidence, not a new registered CI regression or gate.

Concurrent product work advanced the consumer while its isolated candidate was
being tested. Integration retained that history and its proof update; committed
af0253b was then independently verified: 14 gates, 567 pass / 0 fail, strict doctor,
eight compositions, fourteen current input-bound proofs, clean worktree and stable
HEAD. Consumer record 0050 preserves the exact commands, script hashes and logs.
This validates configuration behavior, not product effectiveness or net savings.
No live model call, automatic push, PR, approval or merge occurred in this task.
