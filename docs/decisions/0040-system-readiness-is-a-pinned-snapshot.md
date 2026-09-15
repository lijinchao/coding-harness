# 0040 — System readiness is a pinned multi-repository snapshot

Status: implemented

## Problem

A repository manifest can prove one checkout, while a feature may span a
governance repository, a producer, and several consumers. Documentation links
can suggest those relationships but cannot prove which revisions were reviewed
together, whether the checkouts drifted, or which commands were approved for
each verification tier. Automatically promoting survey discoveries would turn
heuristics into authority and could execute external-service scripts.

## Decision

A system manifest is a separate, versioned artifact. It declares repositories
with roles, paths, and full Git revisions; directed producer/consumer contracts
with repository-owned evidence; and reviewed verification commands assigned to
one of five tiers. `system-check` is read-only: it validates the declaration,
compares the current checkouts with the pins, rejects dirty repositories, and
checks evidence presence without running any command.

The status `declared-ready` means only that this snapshot is aligned and its
evidence exists. It does not mean that verification commands passed, that an
integration environment was qualified, or that the system is released.

One reviewed tier may then run through `system-run`. It produces a receipt
outside the declared repositories, bound to the manifest hash, repository
revisions, commands, results, timeouts, and output hashes. External-qualified
execution requires a separate invocation flag. Receipt verification never
reruns commands.

System manifests name required qualification tiers. `system-ci` observes the
snapshot and their receipts without running commands. Its default Shadow mode
reports the same unhealthy conditions as enforcement but exits zero;
`--enforce` is the explicit transition to a merge-affecting policy. Receipts
bind the manifest hash rather than its host-specific absolute path so a complete
system bundle can move between workstations and CI.

## Alternatives

- Put sibling repositories in one repository manifest: this makes a portable
  repository contract depend on checkouts outside its boundary.
- Generate verifications directly from survey: discovery cannot authorize
  commands, especially historical gates that may call models or live services.
- Store branch names instead of revisions: a moving branch cannot identify the
  version combination that was reviewed.

## Consequences

- Cross-repository drift and missing contract evidence become machine-visible.
- Every repository needs at least one explicitly reviewed verification.
- Paths may be absolute or relative to the system manifest, while revisions are
  immutable full commit IDs. An unresolved member uses `revision: null` and
  prevents readiness instead of accepting a guessed pin.
- Tier execution is explicit and bounded; a receipt proves one tier run, not
  release or runtime health beyond the commands it records.
