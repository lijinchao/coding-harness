# Roadmap

Status: v0.1.0 — the base is a versioned, hashed release fetchable from git, one consumer is pinned to it, and its hosted CI drift gate is proven.

This page carries the forward plan: the next three actions, the milestones ahead, and which practices from a mature harness are worth adapting. The reference ([reference.md](reference.md)) and the governance rules ([governance.md](governance.md)) own current behavior; this page owns what is not built yet.

## Next actions

Three things, in order.

1. **Adopt it in one real repository.** Run `node bin/harness.mjs init --dir <repo>`, author that repository's `AGENTS.delta.md`, and add `harness check` to its CI. Then hand-edit the composed `AGENTS.md` once and watch the job fail; that failure is the gate's proof.
2. **Make the base distributable.** The base is now a released version plus per-file hashes in `harness.lock`; a consumer resolves `base@0.1.0` from a registry. What remains is fetching that registry from a remote instead of a local directory.
3. **Collect the first effectiveness signals.** Record the first-pass check rate and every review finding that cites a policy already covered by a guide. Two weeks of those two numbers tell you which guide is not working.

## Milestones

### M1 — first real consumer

Compose one repository's `AGENTS.md` from the base, run `harness check` in CI, and prove the drift gate fires on a deliberate hand edit.

Done when: that repository's CI job fails on drift, and passes after `harness sync`.

Progress: proven locally and in hosted CI. On GitHub the adoption push is green, a deliberate hand edit fails the "Fail on harness drift" step, and `harness sync` restores green. The same check runs in the consumer's `run_harness.sh`.

### M2 — pinned base distribution

Replace relative base paths with a declared base version and a locked hash. `harness sync` fetches that exact base; `check` fails when the fetched base differs from the pin.

Done when: a consumer on a different checkout path resolves the same base, and a tampered base fails the hash check.

Progress: `harness release` writes `base@<version>/` with per-file hashes; the lock records them; `base:` sources resolve inside the pinned release, whether from a local registry or a git URL fetched at tag `v<version>` into `.harness/`. Both done conditions are covered by tests. Remaining: distribute the tool itself as a fetched release rather than a checkout.

### M3 — governance mechanics

Add the artifact types governance refers to: decision records under `docs/decisions/`, a cross-repository drift scan, and a `harness prove` command that automates the three-step gate proof.

Done when: `harness scan --root <dir>` lists every consumer whose harness is stale or diverged, and `harness prove` exits non-zero for a gate whose action no longer fires.

### M4 — artifact and check coverage

Extend `harness validate` from the manifest to the artifact files it declares: a skill must carry its required sections, and a gate must declare a runnable command.

Done when: a skill missing its verification section fails validation, and the base ships decision-record and postmortem templates.

### M5 — adoption ergonomics

Make adoption one command: `harness init` writes the manifest, the lock, and the CI snippet; `harness diff` previews what a base upgrade changes before it lands. Add YAML manifest support once adoption matters more than the zero-dependency constraint.

Done when: a new repository reaches a green `harness check` from `init` alone.

## What to adapt from DeepSeek Harness

The DeepSeek Harness checkout on this machine runs a mature version of this harness on itself. The paths below are relative to that checkout, not to this repository. Take the mechanisms; leave the product-specific content.

### Adapt nearly as-is

| Item | Source | Why it transfers |
|---|---|---|
| Gate aggregator with a worker pool | `scripts/run-gates.ts` | One named list drives local runs and CI, so the two lists cannot drift |
| Prove the check fails | `docs/testing.md` | "A guard only guards if the regression actually fails it" — the discipline behind this project's `prove_fires` |
| Smallest-check selector | `.agents/skills/dsh-pre-push-checks/SKILL.md` | Maps a changed surface to the smallest covering check set, instead of rerunning everything |
| Markdown wrap and link gates | `scripts/verify-md-wrap*`, `scripts/verify-md-links*` | Cheap, deterministic, and this project's Markdown grows with it |
| Documentation word budgets | `scripts/verify-doc-budgets.ts` and its manifest | Caps a document and forces relocation instead of accumulation |
| Decision records with mandatory alternatives | `.agents/notes/README.md` | The format (problem, decision, alternatives, consequences) plus a lifecycle and an archival rule |
| Postmortem template | `docs/postmortem/README.md` | An incident becomes a record and a permanent regression test |
| Test tiers | `docs/testing.md` | Names unit, coverage, snapshot, and end-to-end tiers so coverage claims stay honest |
| Verify the world, not the self-report | `docs/testing.md` | An end-to-end check reruns the command or rereads the file; it never trusts the agent's own summary |
| Clone detection and dependency hygiene | `pnpm run duplication`, `pnpm run hygiene` | Run as ordinary gates, not as periodic cleanups |
| Defensive patterns | `docs/defensive-patterns.md` | A checklist read before lifecycle, concurrency, subprocess, or teardown work |

### Adapt the pattern, replace the content

| Item | What to keep | What to replace |
|---|---|---|
| Tiered instruction files | The tiering and the word budget | The standing orders themselves |
| Documentation standard | The slop checklist: duplicated rules, narrated history, reasoning transcripts | Repository-specific tiers and catalogs |
| Skill format | The `SKILL.md` frontmatter trigger and the required sections | The skill bodies |
| Review guide | The pass structure and the severity line | The review checks |

### Do not adapt

- **Cordis plugin conventions** — registrations as effects, waterfall `next()`, capability seams, typed event maps. They describe that product, not a portable harness.
- **Session-log, Typert, and i18n-pairing contracts** — they serve that product's runtime and its bilingual documentation.
- **Package layout and TypeScript aggregate rules** — specific to that repository's build.

## How this project iterates

- A rule enters the base only after an observed failure, per [governance.md](governance.md).
- A release is a versioned, tagged artifact that consumers pull; the base is never edited in a consumer's tree.
- Every release proves at least one gate still fires.
- Prune before adding: a guide whose failure can no longer occur is deleted, not kept.
