# 0010 — Verification artifacts: change records required, manual verification recommended

## Problem

The base says "one change, one plan" and requires decision records, but it has no artifact contract for a change plan or for the manual product validation that automated checks cannot perform. Without one, the plan lives only in a conversation, and product-experience findings live nowhere.

## Decision

Two artifact types join the base. A **change record** lives under a declared `governance.changes` directory and carries `## Problem`, `## Approach`, and `## Verification`; `doctor` rejects a record that is missing one. A **manual verification** record lives under a declared `governance.manualVerification` path and carries `## Target`, `## Task`, `## Observation`, and `## Decision`; the base recommends the key, and `doctor` checks only that the declared path exists. Automated verification stays at the unit, integration, and end-to-end tiers; manual verification exists for the product experience those tiers cannot assert.

## Alternatives

- Require manual verification: a gate on a subjective, human experience is either skipped or faked, so it would decay into a dead gate.
- Check the manual record's sections: the value is the observation, not the headings, and the failure the user named was a missing record, not a malformed one.
- Fold the change plan into the decision record: a decision records a choice that outlives the change; a change record records one unit of work and its verification.

## Consequences

- A repository that declares `governance.changes` must keep each record's three sections, or `doctor` fails.
- `manualVerification` is recommended, so a repository without it sees a `doctor` warning and no failure; the L-3 product-validation gap stays visible in CI output instead of blocking unrelated work.
- `doctor` now separates blocking problems from warnings; `harness doctorProblems` keeps returning only problems for callers that do not surface warnings.
- The base ships `templates/change-record.md` and `templates/manual-verification.md`.
