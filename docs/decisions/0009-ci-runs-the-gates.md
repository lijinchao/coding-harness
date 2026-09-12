# 0009 — Require the CI to run the gates and prove them

Status: implemented

## Problem

A consumer can pass every gate locally and in CI while its CI workflow runs only `harness check`, or a subset of the gates. The manifest is then the real gate list and the workflow is a second, drifting list. A gate added after the workflow was written never runs in CI, and a gate that stopped firing is never noticed.

## Decision

The base's `requirements.json` declares `requiredCiCommands: ["harness gates", "harness prove"]`. A consumer declares where its CI lives under `governance.ci`. `harness check` fails until the key is present because it is in `requiredGovernance`, and `harness doctor` fails when a declared CI file does not contain each required command. The `init` scaffold writes `governance.ci` and a workflow that runs both commands.

## Alternatives

- Infer the workflow from `.github/workflows/*`: a repository may use another CI system, and a wrong guess is a false gate.
- Run `harness gates` from a wrapper script: the wrapper's name is not stable, so a literal-content check cannot see the commands.
- Check only that the workflow mentions `harness`: too weak, because `harness check` alone is the drift-only workflow this change replaces.

## Consequences

- A consumer that upgrades past `0.1.12` must add `governance.ci` and make that file run `harness gates` and `harness prove`, so its gates are exercised in CI.
- The check is a substring test on the declared file. A workflow that calls the commands through an unusual wrapper must either call them directly or change the base requirement.
- CODEOWNERS is already required through `governance.owners`; this decision adds capabilities, not a second ownership mechanism.
