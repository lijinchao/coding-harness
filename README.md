# Coding Harness

A base framework, a generator, and drift checks for the outer harness a team builds around a coding agent.

The **outer harness** is everything a team builds for its own codebase so the agent writes correct code. It does not include the agent's own runtime: the agent loop, its tools, its sandbox, and its session state are a dependency you choose.

The harness has four concerns:

| Concern | Role |
|---|---|
| Guides | Steer the agent before it acts |
| Sensors | Observe after it acts, so it can self-correct |
| Gates | Enforce a rule without judgment, or route the decision to a person |
| Artifacts | Carry state between stages and record decisions |

This project gives you three things:

- **[docs/reference.md](docs/reference.md)** and **[docs/contracts.md](docs/contracts.md)** — the vocabulary and carrier rules, and the artifact contracts they admit.
- **A base layer and a manifest** — `base/` declares the shared layer; each repository's `harness.manifest.json` declares what it pins and how the result is verified.
- **A zero-dependency CLI** — `harness survey | system-check | system-run | system-receipt-check | validate | sync | check | init | upgrade`.

## Why a shared base

Copy-paste is how a harness drifts. Each repository pins one base version and keeps only its own delta. `harness sync` composes the two; `harness check` fails when the composed result no longer matches `base@version + delta`, which catches a hand edit that silently diverges from the shared version.

## Quick start

The CLI runs on Node.js 20.11 or later with no install step.

```sh
node bin/harness.mjs validate --manifest examples/consumer/harness.manifest.json
node bin/harness.mjs sync     --manifest examples/consumer/harness.manifest.json
node bin/harness.mjs check    --manifest examples/consumer/harness.manifest.json
```

A consumer manifest declares `"base": { "source": "<release registry>" }` and pins a base version; composition sources prefixed `base:` resolve inside the fetched `base@<version>`. The source may be a local registry or a git URL prefixed `git:`, in which case `sync` and `check` fetch tag `v<version>` into `.harness/` and verify it. `sync` writes the composed `AGENTS.md` and `REVIEW.md` and records the base's per-file hashes, the tool version, and the outputs' hashes in the manifest's `lock`. `check` recomposes in memory and fails when an output drifts, the tool version differs from the pin, or a fetched base file no longer matches the lock.

To add the harness to an existing repository:

```sh
node bin/harness.mjs survey --dir path/to/repo
node bin/harness.mjs init --dir path/to/repo
```

`survey` is read-only; see [docs/survey.md](docs/survey.md).

## Repository layout

```text
docs/reference.md              the normative concepts and vocabulary
docs/contracts.md              the artifact contracts each manifest field must satisfy
docs/governance.md             ownership, change sources, versioning, proof, pruning
docs/roadmap.md                next actions, milestones, and what to adapt
schema/                        JSON schema for the manifest
dist/base@<version>/           released, hashed base a consumer pulls
base/                          the shared layer repositories pin
  AGENTS.base.md               composed into each repository's AGENTS.md
  REVIEW.base.md               review passes and severity thresholds
  skills/<name>/SKILL.md       procedures that must run consistently
examples/consumer/             a runnable consuming repository
bin/harness.mjs                the CLI
src/                           manifest loading and composition
test/                          node:test suites
```

## CLI

| Command | Effect |
|---|---|
| `survey --dir <path>` | Inspect an unadopted repository without writing or running discovered commands |
| `system-check --manifest <path>` | Check a pinned multi-repository snapshot without running its commands |
| `validate --manifest <path>` | Fail on any missing required field |
| `sync --manifest <path>` | Compose outputs and rewrite the lock |
| `check --manifest <path>` | Fail when a composed output drifted from `base@version + delta` |
| `init --dir <path>` | Scaffold a delta, manifest, bootstrap, and CI, then compose it |
| `upgrade --manifest <path> --to <version>` | Pin a new base version and re-sync |
| `release --base <dir> --out <dir>` | Build a versioned, hashed base release under `<out>/base@<version>/` |
| `gates --manifest <path>` | Run every declared gate; one list drives local and CI |
| `scan --root <dir>` | List consumers whose harness is stale or diverged |
| `prove --manifest <path>` | Run the three-step proof for each gate action |
| `diff --manifest <path> --to <version>` | Preview what a base upgrade changes |
| `metrics --log <file>` | First-pass rate and per-gate failures from gate reports |

## Make the harness evolve

Every harness change traces to an observed failure, and a rule is promoted only as evidence accumulates:

```text
observed failure -> skill -> hook -> CI check -> structural test -> shared base
```

A gate is admitted only with a `prove_fires` action you have actually run. A gate nobody has watched fail is not known to work. [docs/governance.md](docs/governance.md) owns ownership, upgrade policy, effectiveness signals, and pruning; [docs/roadmap.md](docs/roadmap.md) owns what is not built yet.

## Status

v0.1.39. The manifest is JSON to keep the CLI dependency-free; YAML support is deliberately deferred.
