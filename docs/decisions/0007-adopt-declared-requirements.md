# 0007 — Adopt the base's declared requirements

Status: accepted
Date: 2026-09-12

## Problem

A consumer could pin the latest base and tool and still declare no governance and no `doctor`
gate. The version contract covered the base content and the tool's integrity, not the consumer's
adoption of the capabilities the base declares. This project produced exactly that:
`starlight-garden` pinned 0.1.8 while declaring neither `governance` nor `doctor`.

## Decision

- A base release ships `base/requirements.json` declaring `requiredGates`,
  `requiredGovernance`, and `recommendedGovernance`.
- `harness check` loads the pinned release's requirements and fails (status `stale`) when a
  required gate or governance key is missing; `harness doctor` reports the same plus the
  repository's own governance facts; `harness diff` previews the capability delta.
- `harness init` and the example consumer adopt `governance.owners` and a `doctor` gate, so the
  template carries them.

## Alternatives

- **Make governance required in the schema.** Rejected: a base release predating the requirement
  would break old consumers; requirements belong to a release, not to the schema.
- **Have `upgrade` inject missing gates automatically.** Rejected: silently editing a consumer's
  gate list is worse than a failing check that names the gap.

## Consequences

- Upgrading past the release that adds a required capability fails `check` until the consumer
  adopts it, and the failure names what is missing.
- Adoption is enforced by the drift gate the consumer already runs, not only by an opt-in command.
