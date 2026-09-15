# System receipt freshness and Shadow history

Decision: docs/decisions/0040-system-readiness-is-a-pinned-snapshot.md

## Context

System CI currently rejects receipts after manifest, repository, command, or
result drift, but a passing receipt can otherwise remain valid forever. Shadow
also reports only the current observation, so a team cannot distinguish one
green run from sustained stability before explicitly enabling enforcement.

## Plan

1. Add a required receipt age budget and advisory promotion criteria to the
   system qualification contract.
2. Make `system-ci` reject receipts older than the budget or timestamped in the
   future, while keeping `system-receipt-check` focused on immutable bindings.
3. Accept an optional read-only history directory containing earlier
   `system-ci` JSON reports for the same system.
4. Compute a bounded sample size, healthy count and rate, current healthy
   streak, ignored history count, and advisory promotion eligibility including
   the current observation.
5. Keep Shadow non-blocking and command-free. History eligibility must never
   automatically enable `--enforce`, and current enforcement must not depend on
   advisory history.
6. Prove freshness boundaries, malformed and foreign history isolation,
   bounded windows, stable statistics, and no command execution.

## Verification

- `node --test test/system.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`
- Real QIHOOAgent Shadow report with no command execution or history writes.
