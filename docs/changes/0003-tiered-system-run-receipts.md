# Tiered system run receipts

Decision: docs/decisions/0040-system-readiness-is-a-pinned-snapshot.md

## Context

`system-check` proves that a declared multi-repository snapshot is aligned, but
deliberately does not execute its reviewed commands. The next missing link is
evidence that one verification tier ran against that exact version combination.
Without a receipt, command output in a terminal cannot be tied back to the
manifest or checked for staleness later.

## Plan

1. Add `system-run` with required manifest, tier, and receipt output options.
2. Refuse execution unless `system-check` is ready and the selected tier has at
   least one reviewed command.
3. Keep `external-qualified` disabled unless the caller passes a distinct,
   explicit opt-in flag.
4. Bound each command with a timeout, run it in its declared repository, and
   write a receipt after both passing and failing runs.
5. Bind the receipt to the system manifest hash, repository revisions, selected
   tier, exact commands, result status, duration, and stdout/stderr hashes.
6. Add an independent receipt check that rejects manifest drift, revision drift,
   failed results, and malformed evidence without rerunning commands.

## Verification

Pending implementation.
