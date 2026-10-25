# 0051 — Bind checker inputs and make dependency resolution offline-aware

Status: accepted
Date: 2026-10-25

## Problem

agentic-ops replaced a checker with an unconditional success message without
invalidating its recorded proof. Definition hashes exclude checker content.
Manual Git worktrees also lack ignored caches; bootstrap can hang fetching
dependencies before the CLI starts. Existing proof worktrees already carry caches.

## Decision

First restore the known audit stub in the consumer and upgrade it to 0.1.47.
Add explicit repository-relative file lists `gate.proof_inputs`; snapshot sorted
path/content hashes into each proof, bind the declaration into its definition,
and compare current bytes in both prove --check and gates. Missing, duplicate,
untracked, escaping or symlink-escaping inputs fail. Do not infer transitive
dependencies or hash all product sources. `proofs.requireInputs: true` requires
input declarations for gates covered by the proof policy; legacy mode remains
explicitly declaration-only. Additions to the declared set invalidate proofs.

Add --offline/HARNESS_OFFLINE from bootstrap through base/pack resolution and
child commands. Reuse a matching main-worktree cache without global config or
copying credentials; cached artifacts still undergo existing integrity checks.
Offline cache misses fail before Git fetch; online fetches have bounded waits.
Neither mode sandboxes arbitrary gate commands or networks used by tests.

Release immutable 0.1.48 after red/green regressions, then upgrade self/example
and consumer, bind their checker inputs, refresh proofs and producer attestation.
Consumer-only follow-up adds scheduled refresh PRs with review margin and tests
for the real report aggregation boundary. Keep architecture checkers separate.
No dependency additions, live model calls, cache deletion, automatic PR merge
or business-runtime iteration. Publish reviewed branches/PRs, not directly main.

## Alternatives

- Hash only the command: reproduces the audit failure.
- Automatically parse arbitrary commands/imports: promises completeness we cannot verify.
- Treat offline as a network sandbox: bootstrap policy cannot constrain arbitrary checks.

## Consequences

Regressions must reject hollowed/changed/deleted inputs, require migration of
legacy proofs under strict input policy, verify cache integrity offline and
manual-worktree cache reuse, and prove missing dependencies do not contact Git.
Full suite, pinned example, isolated fault proofs and cold consumer checks remain
required. Reviewer ownership and actual injected failures are not replaced by hashes.

Observed integration departure: the first offline whole-suite run had four
failures because fixture setup inherited HARNESS_OFFLINE=1 while intentionally
testing cold local file:// clones. Isolate only those fixture environments;
retain all assertions and dedicated offline refusal tests. This does not
relax the tool's offline policy or claim to sandbox arbitrary test commands.
