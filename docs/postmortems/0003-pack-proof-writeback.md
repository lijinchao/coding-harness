# Pack proofs materialized into the consumer manifest

## Impact

The local coding-harness delivery-flow trial proved all ten gates, then its
next command failed on a pack/repository gate collision. No remote release or
external consumer was changed. The original declarations were recovered while
retaining the real proof records.

## Root cause

`readValidManifest` resolves packs into an in-memory merged manifest carrying
the raw repository object under `PACK_RAW`. `sync` already persists that raw
object, but `prove --record` serialized the merged one. Existing pack
conformance exercised `prove` without recording, so it missed the transition.
The adjacent upgrade path also changed the merged root version without
changing the raw primitive version that sync persists.

## Response

Reproduce the writeback failure in a fixture consumer before fixing the writer.
Persist only raw declarations and the updated lock, and explicitly propagate
the upgraded root version. Use a local 0.1.42 tool release for the self/example
pins; a 0.1.43 follow-up also retains pack/override locks and verifies resolved
pack hashes against the stored pin. Do not claim the older writer has the fix.

## Regression test

Regression: test/pack-proof-record.test.mjs

The test records a pack proof, checks no contribution was materialized,
reloads and re-proves the consumer, upgrades it, and checks its pin and lock.

## Action items

- @lijinchao: retain record/reload/upgrade in pack acceptance journeys.
- @lijinchao: review the delivery pilot before remote publication or adoption
  into game-design; protected human review remains separate from execution.
