# Checker input binding and offline resolution

Decision: docs/decisions/0051-proof-inputs-and-offline-resolution.md

## Verification

`node --test test/proof-inputs.test.mjs` first failed all six initial cases,
including unchanged-command checker hollowing. Additional red regressions
covered malformed stored hashes, prototype-named file paths and require-none
policy. The real CLI records inputs and rejects hollowed checkers in both
prove --check and gates. File inputs are explicit, not an inferred dependency graph.

`node --test test/offline.test.mjs` first failed all four cases. After correction,
missing caches fail before clone, bootstrap propagates offline state, manual
worktrees borrow matching tools, base and pack caches, and corrupt cached release
bytes still fail. The corruption test matches the existing release diagnostic;
no integrity check was removed. No live provider or business API was invoked.

Full pre-release `npm test`: 291 passed / 0 failed. Bootstrap was generated using
applySync, not hand-edited. Explicit input policy is enabled on the self harness;
its delivery-pack gate uses the existing explicit override mechanism rather
than changing an old pack release. Self/example upgrade, isolated proofs and
producer attestation complete the release transaction.

First whole-suite offline diagnostic: 287 pass / 4 fail; cold local file://
fixture setup inherited the caller's offline policy. Its explicit construction
environment is now isolated, preserving refusal and integrity assertions.
No new proofs were recorded from the failed isolated proof attempt.
After fixture isolation, full offline gates pass with 291 tests / 0 failures;
all ten input-bound isolated proofs fired and recovered. Strict doctor,
example check, proof freshness (10/10 inputs) and attestation verify at 0.1.48.
