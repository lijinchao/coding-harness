# Correct current knowledge before governance expansion

Decision: docs/decisions/0052-evidence-first-delivery.md

## Context

Stage one of the owner-accepted SPEC. Direction now separates passed checks,
reviewed evidence and product acceptance, and describes the existing conditional
CI attestation accurately. Governance documents explicit input binding and the
limits of check-health metrics. Roadmap prioritizes adoption cost review and
retains the deferred GitLab qualification gap. The reduction proposal is pending,
not an applied budget, gate, proof or runtime change. Consumer correction is
tracked by agentic-ops decision 0030; the full SPEC has only this repository's
decision 0052 as its authoritative carrier.

## Verification

`HARNESS_OFFLINE=1 npm test`: 292 pass / 0 fail.
`./harness check --manifest examples/consumer/harness.manifest.json --offline`:
2 compositions match 0.1.49. Strict doctor passed; prove --check reported ten
current gates with ten declared input sets; attestation verifies ten proofs at
c5fb3cd. Producer diff is docs-only; reviewed new document links resolve.

Consumer source changed concurrently and another task committed our staged
documents with its runtime edits. That mixed working-tree gate run exited zero
but is not used to qualify an exact candidate. A detached snapshot at b0a0be0
passed all fourteen gates; strict doctor, eight compositions and fourteen current
input-bound proofs passed, with HEAD unchanged and a clean snapshot worktree.
See the consumer change record for commands and retained local evidence.
Manual content review checks implemented-versus-future release wording and
current-versus-historical proof semantics. Existing checks cover document
structure, not the truth of arbitrary prose or the proposal's effectiveness.
No automated test is claimed to fail merely when these prose edits are reverted.
