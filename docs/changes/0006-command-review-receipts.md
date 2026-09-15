# Isolated command review receipts

Decision: docs/decisions/0040-system-readiness-is-a-pinned-snapshot.md

## Context

Repository survey deliberately returns unapproved command candidates, while a
system manifest requires a human `reviewed_by`. There is no machine-checkable
artifact between those states. A one-off diagnostic can record that a command
ran in a copied checkout, but its exact revision, output identity, filesystem
changes, and observation limits are not bound by a portable contract.

## Plan

1. Add `harness command-review` with required repository, full revision, exact
   single-line command, and output path inputs.
2. Export only committed files from the exact revision into a temporary
   directory, run the command there with a timeout, and always remove the
   temporary directory.
3. Hash the isolated tree before and after execution and record added, modified,
   and removed paths. Reject receipt output inside the source repository.
4. Bind the receipt to repository identity, revision, exact command, timing,
   result, and stdout/stderr hashes without retaining command output.
5. Make observation limits explicit: only the isolated tree is compared;
   network, child processes, and absolute-path writes are not observed. Keep
   obvious external commands disabled unless the invocation explicitly passes
   `--allow-external`.
6. Fix every receipt to `authorizes_verification: false`. A passing review may
   inform a human decision but must never fill or substitute for `reviewed_by`.
7. Add a read-only `command-review-check` that validates structure and verifies
   the receipt's repository revision and command identity without rerunning it.
8. Cover exact-revision export, mutation reporting, timeout/failure receipts,
   output immutability, external-command refusal, tamper detection, cleanup,
   schema parity, and the no-authorization invariant.

## Verification

- `node --test test/command-review.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`
