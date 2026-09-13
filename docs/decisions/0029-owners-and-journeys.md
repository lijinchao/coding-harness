# 0029 — A declared owner is routed, and the operator journeys are recorded

Status: implemented

## Problem

The manifest declares an `owner` for each skill and `governance.owners` for the repository, but nothing checked that CODEOWNERS routed to them. This repository declared `@coding-harness` for all three skills, a name no CODEOWNERS file matched, so the accountable owner of each procedure was unreachable and no review would follow; the check that was added for it found exactly that. Manual verification had the reverse problem: the base ships the template and the `manualVerification` key, this repository declared neither, and the product experience the template promises was never recorded.

## Decision

`harness doctor` resolves every declared owner — `governance.owners` and each `skills[].owner` — against CODEOWNERS whenever an owner is declared, and fails when no CODEOWNERS file exists or when a name is missing from it; the check runs before the early return for a manifest without governance, so a repository that declares only skill owners is still checked. This repository declares `@lijinchao`, which is the owner CODEOWNERS routes to. `docs/MANUAL_VERIFICATION.md` records the three operator journeys — `init` to `check` to `prove`, release to upgrade to `prove`, and record to commit to `prove` — and is declared under `governance.manualVerification`; the first two run as `test/journeys.test.mjs`, and the third is the repeated-proof behavior `test/scan-prove.test.mjs` covers.

## Alternatives

- Check only `governance.owners`: a skill's owner is accountable for that procedure, so an unrouted skill owner is the same defect.
- Warn instead of fail on an unrouted owner: an owner nobody routes to is not an owner, and the fix is one line.
- Make the manual record a fourth verification tier: it is not a tier; it records what no check asserts, which is why its sections are target, task, observation, and decision.
- Keep the journeys in prose only: a journey that lives only in a record has already started decaying, so the two with a deterministic outcome became tests.

## Consequences

- A repository that declares owners but no CODEOWNERS now fails `doctor`, so adoption must route what it declares.
- The journeys cannot rot silently: two are tests that run in CI, and the record names the third.
- The record is date-stamped, so a stale observation is visible instead of implied to be current.
