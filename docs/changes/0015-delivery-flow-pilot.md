# Self-hosted delivery-flow pilot

Decision: docs/decisions/0044-delivery-flow-starts-with-an-acceptance-map.md

## Context

Adopt a local hashed delivery-flow pack, link acceptance criteria to existing
test commands and tier waivers, verify baseline/candidate receipts without
claiming human approval, and inspect game-design's existing local harness.
The trial exposed receipt collisions, a process-global test cleanup assertion,
pack proof serialization, missing upgrade locks, and insufficient enforcement
of stored pack hashes. Regression tests precede the corresponding fixes.
The final local kernel pin is 0.1.43; the pack pin is 0.1.0. No remote push or
game-design product change is included.

## Verification

```text
npm test
tests 203
pass 203
fail 0

./harness check --manifest examples/consumer/harness.manifest.json
check: 2 composition(s) match 0.1.43

./harness prove --manifest harness.manifest.json --isolated --record --timeout 300
10/10 fired on the failure and passed after revert
proofs recorded: 10

./harness prove --manifest harness.manifest.json --check
proofs: current for 10 gate(s)

./harness doctor --manifest harness.manifest.json --strict
doctor: ok
```

The criterion evidence replay used baseline `a6173c7` (exit 1) and scoped
candidate `b347a0e` (exit 0), with byte-identical tests and a matching expected
failure diagnostic. Its report remains pending human acceptance.

game-design: `make verify` passed ruff and 174 tests (two dependency warnings);
`make smoke-stage` passed 93 Godot assertions, including intentional fallback
diagnostics. No real-model or client/backend E2E qualification is claimed.
Detailed adoption mapping and remaining limitations live in
[the pilot report](../delivery-flow-pilot.md).
