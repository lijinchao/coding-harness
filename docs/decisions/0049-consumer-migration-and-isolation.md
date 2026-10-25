# 0049 — Document consumer migration and isolation boundaries

Status: accepted
Date: 2026-10-25

## Problem

The agentic-ops adoption exposed an ordering trap: a 0.1.41 parser rejects new
context/maxBytes fields before upgrade. New scopes also require staged/tracked
files. Native discovery and Git worktree isolation do not establish a security
sandbox, and the first pilot reused private copies of dependency caches.

## Decision

Extend the existing native guide with an ordered consumer migration and separate
cold-clone, worktree and security isolation instructions. Verify this PR from a
remote clone with independent caches; assess agentic-ops in its own local branch
without changing its product runtime or publishing credentials/model traces.
No new Kernel feature, schema, dependency or release is needed for this guidance.

## Alternatives

- Let the old parser accept unknown fields: weakens the manifest contract.
- Call a worktree a sandbox: ignores shared state, inherited credentials and network.

## Consequences

Retain failures in the consumer record, including stale proofs after a version
upgrade. A green command set does not qualify delivery until refreshed proofs
also pass. Run the repository suite and pinned example check before handoff.
