# Direction

This project is a portable control plane for agent-first delivery: a repository declares what must hold, the harness makes those declarations checkable, and a released, pinned artifact carries the rules. [roadmap.md](roadmap.md) owns what is built; this document owns where it is going, and every choice that outlives a change becomes a decision record.

## Two references, two jobs

OpenAI's harness engineering sets the direction: design an environment where an agent can finish a delivery loop without a human in the middle — make the application legible to the agent through UI, logs, metrics, traces, and PR feedback; keep repository knowledge short and true; let a background agent keep entropy down with small cleanup changes. The direction is portable; the article is not a tool specification.

DeepSeek Harness supplies battle-tested parts: a gate aggregator with a worker pool and a platform matrix, process-tree timeouts, verification of real world state instead of a self-report, recorded sessions and browser evidence, duplication and dependency hygiene, defensive patterns. Those mechanisms transfer. Its product facts — Cordis, sessions, the dual SDK, i18n pairing, Windows packaging — do not, and copying them would turn a portable base into one product's rulebook.

## Four layers

1. **Kernel** — what exists: composition of base and delta, versioned and hashed releases, a commit-pinned tool, the gate DAG and changed-surface selection, the rule that a gate must be watched to fail, proof binding with freshness, document/owner/CI drift checks, and the metrics window budget. The kernel is strict and product-free.
2. **Packs** — the next layer: released, hashed artifacts that contribute gates, surfaces, skills, and a CI matrix for one kind of repository (`node-typescript-monorepo`, `web-application`, `agent-runtime`, `python-library`, `cli-product`, `cross-platform-release`). A pack is a base-shaped release with a `pack.json` naming what it contributes; a repository declares `packs`, and the merge is pinned per file in the lock like every other source, so a pack is never a soft recommendation.
3. **Legibility contract** — the layer that follows: a declared adapter set — `start`, `ready`, `observe.ui`, `observe.logs`, `observe.metrics`, `observe.traces`, `reset`, `teardown` — so an agent can bring the application up from a worktree and read what it did. The harness validates the declaration and never implements a browser, a metrics store, or a trace backend.
4. **Behavioral evals** — the last layer: a task contract of fixture, task, world assertion, evidence, feedback, and retry, recorded as evaluation runs that feed the same metrics window (task success, first-pass rate, retries, time-to-green, human interventions, state left behind). A gate proves a rule; an eval measures whether an agent can deliver without one.

## Order and proportion

- 50% toward legibility and evals: they are what makes a long autonomous loop possible, and the kernel already enforces what it can.
- 30% toward DeepSeek-derived mechanisms, delivered as packs so the kernel stays portable.
- 20% toward the kernel itself: the pack interface, and the release transaction below.

The work order is: close the release transaction (done — `release-ready`), then the pack interface, then the first architecture, hygiene, and web-evidence packs, then the legibility contract, then behavioral evals. Agent-to-agent review, automatic repair, and automatic merge come last: an autopilot is worth building only after the loop is measured.

## Non-goals

- No product facts in the base or the kernel. A rule that only makes sense for one repository belongs in that repository's delta or in a pack.
- No rule that no check enforces. A guide without a gate has already decayed.
- No default burden: a new repository gets the kernel and opts into packs. Progressive disclosure is a requirement, not a courtesy.
- No adapter implementations: the harness declares and validates the legibility contract, and the repository owns the adapters.

## The release transaction

A governance tool that lags its own governance state is the failure this project exists to prevent. A release is therefore one transaction, and its last step is a gate: implement, test, release the base, move the self pin and the example, run every gate, re-record every proof, and only then tag and push. `release-ready` fails while any blocking gate lacks a current proof or any recommended artifact is undeclared — in CI as much as locally.
