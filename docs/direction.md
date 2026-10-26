# Direction

This project is a portable control plane for agent-first delivery at bounded governance cost. Reuse a repository's plans, tests, reports and PRs to connect acceptance criteria with checkable evidence; released, pinned artifacts carry shared rules. [roadmap.md](roadmap.md) owns the forward plan; this document owns direction.

Checks passed, evidence adequacy reviewed, and product accepted are separate states. Green gates establish neither sound measurement nor human acceptance. [Decision 0052](decisions/0052-evidence-first-delivery.md) owns the accepted phased SPEC; its [reduction proposal](governance-cost-review.md) awaits approval before adoption settings change.

## Two references, two jobs

OpenAI's harness engineering sets the direction: design an environment where an agent can finish a delivery loop without a human in the middle — make the application legible to the agent through UI, logs, metrics, traces, and PR feedback; keep repository knowledge short and true; let a background agent keep entropy down with small cleanup changes. The direction is portable; the article is not a tool specification.

DeepSeek Harness supplies battle-tested parts: a gate aggregator with a worker pool and a platform matrix, process-tree timeouts, verification of real world state instead of a self-report, recorded sessions and browser evidence, duplication and dependency hygiene. Those mechanisms transfer. Its product facts — Cordis, sessions, the dual SDK, i18n pairing, Windows packaging — do not.

## Four layers

1. **Kernel** — what exists: composition of base and delta, versioned and hashed releases, a commit-pinned tool, the gate DAG and changed-surface selection, the rule that a gate must be watched to fail, proof binding and freshness, document, owner and CI drift checks, and the metrics window budget. Strict and product-free.
2. **Packs** — pinned releases contribute gates, surfaces and skills for a repository kind. [packs.md](packs.md) owns the implemented contract and its gaps.
3. **Legibility contract** — declarations name how to start, observe, reset and stop an application. The repository owns the adapters; the harness checks their contract.
4. **Behavioral evals** — declared tasks carry fixture, action, world assertion, evidence and retry rules. A gate proves an invariant; an eval measures delivery.

## Order and proportion

- The contracts for all four layers exist in the working tool. The current command inventory and release boundary live in [README.md](../README.md#status); the outstanding deployment and qualification work lives in [roadmap.md](roadmap.md).
- Prioritize real consumer evidence and failure feedback before expanding the kernel or adding another pack.
- Pause governance feature expansion while correcting stale guidance and reviewing adoption cost. Three real delivery tasks may establish pilot feasibility, not a causal productivity gain. Product work remains separately authorized.

## Non-goals

- No product facts in the base or the kernel: a rule that only makes sense for one repository belongs in that repository's delta or in a pack.
- No invariant carried by prose alone. A rule that must always hold needs a check; a guide may carry judgment, but it declares how it is verified and what failure looks like.
- No default burden: a new repository gets the kernel and opts into packs.
- No adapter implementations: the repository owns its adapters.

## The release protocol

The [release acceptance protocol](release.md) already includes attestation: it binds version, tag/tool commit, base release, self/example locks and proof set. The current repository CI verifies a recorded attestation after gates and isolated proofs. This is not atomic publication: operators still order release, tag, pin movement, proof recording and push, and CI conditionally skips attestation when none exists. Do not describe the implemented verifier as future work or claim that it prevents every partial publication state.
