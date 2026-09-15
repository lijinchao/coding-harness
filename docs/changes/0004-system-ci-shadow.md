# System CI shadow

Decision: docs/decisions/0040-system-readiness-is-a-pinned-snapshot.md

## Context

System receipts can be produced and checked, but CI has no single read-only
entrypoint that says which tiers are required and summarizes missing or stale
evidence. Receipt bindings also include an absolute manifest path, which makes
otherwise identical evidence fail after a CI checkout moves to another host.
The project is not ready to turn these observations into a blocking merge gate.

## Plan

1. Add required qualification tiers to the system manifest contract.
2. Remove the absolute manifest path from new receipts; the manifest SHA-256 and
   system id remain the portable identity.
3. Add `system-ci --manifest <path> --receipts <dir>` to run system snapshot and
   receipt-freshness checks without executing any verification command.
4. Use deterministic `<tier>.receipt.json` names and report missing, stale, and
   valid tier evidence in stable JSON.
5. Default to Shadow mode: report unhealthy state but exit zero. Require an
   explicit `--enforce` flag before CI can block.
6. Prove the default cannot execute commands and that enforcement changes only
   the exit status, not the checks performed.

## Verification

- `node --test test/system.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`
- Real QIHOOAgent Shadow report with no command execution.
