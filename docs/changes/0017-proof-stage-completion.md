# Reject incomplete proof stages before merge

Decision: docs/decisions/0050-proof-stage-completion.md

## Verification

`node --test test/proof-failure-boundary.test.mjs` ran before the fix: 16 tests,
5 passed / 11 failed. The recovery timeout and CLI record regression failed
because the old tool returned ok despite timedOut=true. Setup, injection,
revert and post-revert setup also accepted timeout cleanup returning zero;
signal cases exposed missing diagnostic classification. Existing injected
timeout and output-assertion checks were retained unchanged.

All success-required stages now share normal-completion qualification;
the injected assertion may fail normally, but timeout/signal still cannot
count as a watched failure. Revert remains attempted after injection.
The CLI regression requires exit 1, unchanged manifest and no injected marker.
The first CLI fixture was rejected for an empty compositions array; after
correcting the fixture, the same CLI assertion was run against the pinned
0.1.46 release and failed with actual exit 0 versus expected 1. It then runs
against the fixed source CLI; no cached-tool path remains in the test.
After correction, the targeted run is 16 passed / 0 failed; the full suite
before release is 277 passed / 0 failed. Release 0.1.47 is a new artifact,
not an edit to any published release.
The published tool was also run against the original review fixture: its
result is now `status=error`, `gate timed out after revert`, rather than ok.
All ten isolated failure/recovery proofs passed with tool 0.1.47, and strict
doctor, proof freshness and the newly generated 0.1.47 attestation verified.
The targeted integration run, full suite, released-tool pins, isolated proofs
and attestation are verified before the authorized PR stack is merged.
