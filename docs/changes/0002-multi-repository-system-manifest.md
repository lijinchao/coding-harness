# Multi-repository system manifest

## Context

Repository survey can discover sibling checkouts and candidate commands, but a
discovery is not a durable system boundary. A coordinating repository still
cannot declare which repositories form one system, which exact revisions were
reviewed together, where a producer/consumer contract is evidenced, or which
commands a human promoted into each verification tier.

## Plan

1. Define a zero-dependency `system.manifest.json` contract with repositories,
   directed contract relationships, and reviewed verification commands.
2. Add `harness system-check --manifest <path>` as a read-only check. It must
   verify repository paths and revisions, report dirty checkouts, resolve
   contract evidence, and reject unsafe or ambiguous verification declarations.
3. Keep command discovery and command authorization separate: survey output is
   never copied or executed automatically, and every system verification names
   its repository, tier, command, and external-service boundary explicitly.
4. Emit stable machine-readable JSON and fail closed when the declared system
   is not ready. Do not run a declared command during this iteration.
5. Hold the JSON schema and executable validator to the same field contract,
   document the boundary, and prove it with isolated multi-repository fixtures.

## Verification

Pending implementation.
