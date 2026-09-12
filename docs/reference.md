# Reference

This reference fixes the vocabulary, the carrier rules, and the artifact contracts for an outer coding harness. It defines what belongs in the harness and how each item is verified. It is a reference, not a tutorial.

## Scope

An outer coding harness is everything a team builds around a coding agent so the agent writes correct code. It covers the instructions the agent reads, the checks that run on a change, and the records the change leaves behind.

The harness excludes the agent itself. The agent loop, its tools, its sandbox, and its session state are a dependency the team chooses; building or configuring them is a different subject.

## The four concerns

Every harness item belongs to exactly one concern.

| Concern | Role |
|---|---|
| Guides | Steer the agent before it acts |
| Sensors | Observe after it acts, so it can self-correct |
| Gates | Enforce a rule without judgment, or route the decision to a person |
| Artifacts | Carry state between stages and record decisions |

An item that fits no concern is out of scope. An item that fits two is split.

## Carrier rules

The carrier decides how an item is written, reviewed, and enforced.

| Content | Carrier | Why |
|---|---|---|
| A procedure that must run consistently | Skill | The trigger decides when it applies |
| A fact, decision, or plan | Document | It must be reviewed, versioned, and linked |
| An invariant that must always hold | Gate | Only a program enforces it without judgment |

Promote an item along this ladder as evidence accumulates:

```text
observed failure -> skill -> hook -> CI check -> structural test -> shared base
```

Start with the weakest carrier that works. Promote a rule when it has to hold, not when it merely happens often.

## Artifact contracts

Each artifact type has a required skeleton. `harness validate` rejects a manifest whose gates or skills omit a required field. The JSON schema in `schema/` and the validator in `src/manifest.mjs` are one contract: the validator exports its key groups, and `npm test` asserts each equals the schema's properties and required lists, so a field added to one without the other fails the tests.

### Skill

| Field | Meaning |
|---|---|
| `trigger` | The condition under which the skill applies |
| `inputs` | What the skill reads |
| `steps` | The procedure, in order |
| `verification` | How the agent confirms the steps worked |
| `failure` | What to do when verification fails |

### Gate

| Field | Meaning |
|---|---|
| `id` | Stable identifier |
| `command` | The command that runs the check |
| `protects` | The invariant the gate protects |
| `prove_fires` | The action that must make the gate fail |
| `prove_fires_command` | The command that introduces the failure (required for a blocking gate) |
| `revert_command` | The command that undoes the failure (required for a blocking gate) |
| `expect` | `forbid` output patterns and the `allow` lines that are benign |
| `severity` | `blocking` or `advisory` |
| `phase` | Optional label; an unphased gate runs in every phase |
| `needs` | Gate ids that must pass before this gate runs |
| `after` | Gate ids that must finish first; their failure does not skip this gate |
| `always` | Select this gate in every changed-surface selection |

A gate without `prove_fires` is not admissible. A blocking gate must also declare `prove_fires_command` and `revert_command`; `harness validate` rejects it otherwise and `harness prove` exits non-zero when the gate does not fire. A gate nobody has watched fail is not known to work.

A gate passes only when its command exits zero, does not time out, and its output contains no line matching an `expect.forbid` pattern unless the line also matches an `expect.allow` entry. Exit code alone is not proof of a clean run; an engine that exits zero while printing errors fails such a gate. A base release may set `requireOutputAssertions: true` so a blocking gate without `expect.forbid` is rejected.

A gate may declare a `phase`. `harness gates --phase <name>` runs the unphased gates plus the gates in that phase, and `harness gates` without `--phase` runs every gate. Tag a slow gate `full` so a local `--phase fast` run skips it while CI, which passes no phase, still runs it.

A gate whose `needs` dependency fails or is skipped is itself skipped and reported `skip`, so a broken prerequisite never looks like a passing check; `after` orders gates without propagating failure. `harness validate` rejects an unknown dependency and a dependency cycle, `harness gates --fail-fast` starts no new gate after a blocking gate fails, and `harness select` includes the dependencies of every gate it selects.

A gate's command runs under a shell in its own process group. On timeout the runner signals the group with `SIGTERM` and escalates to `SIGKILL` after five seconds, and it forwards `SIGINT` and `SIGTERM` to the group before exiting, so a timed-out gate leaves no children behind. A result reports exit code, signal, timeout, and duration separately; `harness gates` prints the signal beside the timeout, and `--report` records the timeout and duration per gate.

### Evidence surface

| Field | Meaning |
|---|---|
| `id` | Stable identifier |
| `paths` | Repository-relative globs this surface covers |
| `requires` | The gate ids a change to those paths requires |

A manifest may declare `surfaces`. `harness select --manifest <path> (--since <ref> | --changed <path>)` prints the gate ids a change selects: the union of the surfaces its changed files match, plus every gate marked `always: true`. `harness gates --changed <path>` and `harness gates --since <ref>` run that set; `harness gates` without a selection runs every gate, which is what CI should do. `harness validate` rejects a surface that requires an unknown gate, and a gate that no surface requires and that is not `always`, so a new gate cannot silently fall outside the matrix. Without `surfaces`, selection is every gate.

### Document health

| Field | Meaning |
|---|---|
| `governance.docs` | Documents whose links and word budget are checked |
| `governance.instructions` | Globs for every instruction file an agent can read |

`harness doctor` checks that each declared document exists, that its relative Markdown links resolve (a fragment must name a heading in the target file), and that it stays within its optional `maxWords` budget. It also walks the repository for `AGENTS.md` and `AGENTS.delta.md`, and fails when a file is not matched by `governance.instructions` or when a declared glob matches no file. A budget forces relocation instead of accumulation; an unmanaged instruction file is a rule nobody governs. Both keys are recommended, not required.

### Guide section

| Field | Meaning |
|---|---|
| `rule` | The instruction, one or two lines |
| `rationale-link` | Where the reason lives |
| `owner` | Who changes it |

### Decision record

| Field | Meaning |
|---|---|
| `problem` | The motivation, written to stand alone |
| `decision` | What was decided |
| `alternatives` | Each real alternative and why it lost |
| `consequences` | What the decision cost and bought |

`harness validate` loads each declared skill file and rejects it when the frontmatter lacks `name` or `description`, or when it lacks any of `## Inputs`, `## Steps`, `## Verification`, `## Failure`. A gate's `command` must be non-empty and a single line. The base ships `templates/decision-record.md` and `templates/postmortem.md` for the two record types.

### Change record

| Field | Meaning |
|---|---|
| `problem` | The change's motivation |
| `approach` | The plan, committed before the implementation |
| `verification` | The unit, integration, or end-to-end checks that show it worked |

A repository that declares `governance.changes` keeps one record per change under that directory. `harness doctor` rejects a record that lacks `## Problem`, `## Approach`, or `## Verification`. The base ships `templates/change-record.md`.

### Manual verification

| Field | Meaning |
|---|---|
| `target` | The person observed and what they were trying to do |
| `task` | The concrete task they attempted |
| `observation` | What happened, including friction and abandonment |
| `decision` | What the observation changes |

Automated verification stays at the unit, integration, and end-to-end tiers. A manual verification record is the product-experience counterpart for what no test asserts. `governance.manualVerification` is recommended, not required: `harness doctor` checks only that the declared path exists and emits a warning when the key is absent, so the gap is visible without blocking unrelated work. The base ships `templates/manual-verification.md`.

## Verification tiers

Automated verification has three tiers. **Unit** covers a pure function or a single module with no I/O. **Integration** covers two or more real components together. **End-to-end** exercises the shipped artifact the way a user reaches it. Pick the cheapest tier that fails when the change is reverted; the base ships `skills/verification-tiers/SKILL.md` for the procedure. Manual verification is not a fourth tier: it records the product experience no check asserts, and it is recommended rather than required.

## Vocabulary

One term per concept. Do not rotate synonyms.

- **guide**, **sensor**, **gate**, **artifact** — the four concerns. Do not use them interchangeably.
- **harness** — the outer harness. Never the agent runtime.
- **base** — the shared layer a repository pins.
- **delta** — the repository-local layer.
- **drift** — a composed result that no longer matches `base@version + delta`.

## Ownership and review

The shared base has one owner. A change to the base is reviewed like code. A repository-local delta needs no shared review.

Every harness change traces to an observed failure: a repeated mistake, an incident, or a drift finding. A rule with no observed failure is not admissible.

## Prohibitions

- **Dead gate.** A gate whose `prove_fires` action was never run. Run it, fix it, or delete it.
- **Unproven blocking gate.** A blocking gate without a `prove_fires_command` and `revert_command`. Prove it, fix it, or demote it to `advisory`.
- **Prose-carried invariant.** A rule that must always hold but lives only in prose. Promote it to a gate.
- **Dual source of truth.** Two systems that both claim authority over one artifact. Name one and link the other.
- **Speculative rule.** A guide or gate added for a failure that has not happened.
- **Copied base.** A repository that carries its own copy of the base instead of pinning a version.

## Versioning and upgrade

The base is a versioned, hashed release: `harness release` writes `base@<version>/` with a `release.json` per-file hash map. A repository pins one base version and one release source (`base.source`) in `harness.manifest.json`; composition sources prefixed `base:` resolve inside the fetched release.

A source may be a local registry directory or a git URL prefixed `git:`. For a git source, `sync` and `check` fetch the tag `v<version>` into the consumer's cache and verify it against the lock.

A manifest may pin `tool.version`. A committed bootstrap fetches the tool at tag `v<version>` and runs it; the lock records the tool version and a SHA-256 per tool source file, and a running tool that differs from either fails. CI needs no checkout of the tool repository. `harness init` writes `tool.commit` from the running tool, so a scaffolded repository pins the commit as well as the version and the bootstrap rejects a moved tag. `harness init --base-source <dir>` accepts a local release registry and then pins `tool.source` to the running tool's checkout, so a local scaffold needs no network fetch. A local `tool.source` names a directory that contains `bin/harness.mjs`; the bootstrap also accepts a path below that directory.

`harness check` fails when a composed output no longer matches the pin, when a fetched base file differs from its release record, or when it differs from the `lock.base` hashes. `harness sync` refuses to accept a base that differs from the lock.

An upgrade is explicit. `harness upgrade --to <version> [--tool-commit <sha>]` moves the base pin and the tool pin, rewrites every `base@` reference in gate text and every `v<old>` reference in the files declared under `governance.version`, re-syncs the lock, and then runs the governance checks; it exits non-zero when a declared version-reference file still does not name the new version. The repository's own checks must pass before the bump merges. Editing a released base version in place is a broken pin, not an upgrade.

`harness release` refuses to overwrite an existing `base@<version>`; bump `base/VERSION` or pass `--force`. `harness sync` and `harness upgrade` resolve, verify, and compose before writing anything, and commit each file by rename, so a failed upgrade leaves the previous state intact.

The bootstrap resolves `harness.manifest.json` and the tool cache next to the script and runs the tool from that directory, so invoking it by absolute path from any working directory pins the same tool. `harness sync` writes the bootstrap from the running tool and `harness check` fails when it is missing or differs, so a bootstrap fix reaches a repository that was already initialized.

`harness diff --manifest <path> --to <version>` previews the base files and compositions an upgrade changes. `harness gates` accepts `--jobs` and `--timeout`, and `--report` appends a JSON run summary that `harness metrics --log` reads into a first-pass rate.

A base release ships `requirements.json` declaring `requiredGates`, `requiredGovernance`, `recommendedGovernance`, `requiredPhases`, `recommendedPhases`, `requiredCiCommands`, and `requireOutputAssertions`. `harness check` loads the pinned release's requirements and fails when a required gate, governance key, or phase is missing; a recommended one is a `doctor` warning. A declared `governance.ci` file must contain each `requiredCiCommands` entry, so a consumer's CI runs the gates and proves them instead of keeping a second, drifting list. `harness diff` previews the capability delta of an upgrade.

The `release` phase is the convention for an application's own packaging check. The base recommends it but does not know the command: the repository declares a gate with `phase: "release"`, supplies its `prove_fires_command`, and `harness gates --phase release` runs it. A library without a packaging step is not forced to invent one.

`harness doctor --manifest <path>` checks the governance facts the manifest declares under `governance`: files that must name the pinned version, the sections of each decision record, a CODEOWNERS route for each declared owner, and each declared CI file's required commands. It also reports the adoption gap against the pinned release.

`harness gates --manifest <path>` runs every gate the manifest declares, so one list drives local runs and CI and the two cannot drift. A blocking failure exits non-zero; an advisory failure only warns. `harness scan --root <dir>` reports every manifest under a tree as ok, stale, diverged, or error. `harness prove --manifest <path>` runs a gate's `prove_fires_command`, requires the gate to fail, reverts, and requires it to pass; a gate whose action no longer fires exits non-zero.
