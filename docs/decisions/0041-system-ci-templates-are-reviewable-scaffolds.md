# 0041 — System CI templates are reviewable scaffolds

Status: implemented

## Problem

A system CI report is useful only when a pipeline preserves it, but each team
currently has to invent artifact paths and provider YAML. A complete generated
workflow would be dishonest: the Harness cannot know sibling-repository
credentials, checkout layout, or how one CI installation restores artifacts
from an earlier pipeline.

## Decision

The tool exposes `system-ci-template` for GitHub Actions and GitLab CI. Printing
to stdout is the default; writing a file requires `--out`, and replacing one
requires `--force`. Both scaffolds use one layout:

- `.harness/system-ci/receipts` contains current tier receipts;
- `.harness/system-ci/history` contains reports restored from earlier runs;
- `.harness/system-ci/current/system-ci.json` is this run's observation.

The scaffolds run Shadow only and archive the current report and receipts even
after a failed step. Comments require the adopter to add exact sibling checkout
steps and history restoration. The archived report has a published JSON Schema
and executable validation; only complete reports for the same system enter
history statistics.

## Alternatives

- Generate a complete multi-repository workflow: credentials and checkout paths
  are deployment facts the Harness cannot infer safely.
- Automatically restore the latest artifact: provider retention, permissions,
  and cross-run lookup differ and would turn a template into hidden policy.
- Put `--enforce` in the template behind a variable: an unnoticed variable
  change could bypass the explicit reviewed transition.

## Consequences

- Teams begin with the same paths and report contract without receiving a false
  ready-to-run claim.
- Adoption still needs a reviewed provider-specific patch for repository
  checkout and prior-artifact restoration.
- The generated scaffold cannot block on expected qualification failures, but
  unexpected command or runner failures remain visible to CI.
