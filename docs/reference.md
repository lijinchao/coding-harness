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

Skill, gate, evidence surface, document health, guide section, decision record, change record, manual verification, and postmortem contracts live in [contracts.md](contracts.md).

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

A manifest may pin `tool.version`. A committed bootstrap fetches the tool at tag `v<version>` and runs it; the lock records the tool version and a SHA-256 per tool source file, and a running tool that differs from either fails. CI needs no checkout of the tool repository. A repository's own version is separate from the base pin. `product.version.path` names the one file that holds it, with an optional `pattern` whose first capture group is the version; without a pattern the whole file must be exactly one version. `product.mentions` lists the documents that must agree with it, and `harness doctor` fails a mention that does not. The base pin lives only in the manifest and the lock: it is a dependency, and prose never restates it.

`harness init` writes `tool.commit` from the running tool, so a scaffolded repository pins the commit as well as the version and the bootstrap rejects a moved tag. `harness init --base-source <dir>` accepts a local release registry and then pins `tool.source` to the running tool's checkout, so a local scaffold needs no network fetch. A local `tool.source` names a directory that contains `bin/harness.mjs`; the bootstrap also accepts a path below that directory.

`harness check` fails when a composed output no longer matches the pin, when a fetched base file differs from its release record, or when it differs from the `lock.base` hashes. `harness sync` refuses to accept a base that differs from the lock.

An upgrade is explicit. `harness upgrade --to <version> [--tool-commit <sha>]` moves the base pin and the tool pin, rewrites every `base@` reference in gate text and every occurrence of the previous base version in the documents declared under `product.mentions`, re-syncs the lock, and then runs the governance checks; it exits non-zero when a declared mention still disagrees with the product version source. The repository's own checks must pass before the bump merges. Editing a released base version in place is a broken pin, not an upgrade.

`harness release` refuses to overwrite an existing `base@<version>`; bump `base/VERSION` or pass `--force`. `harness sync` and `harness upgrade` resolve, verify, and compose before writing anything, and commit each file by rename, so a failed upgrade leaves the previous state intact.

The bootstrap resolves `harness.manifest.json` and the tool cache next to the script and runs the tool from that directory, so invoking it by absolute path from any working directory pins the same tool. `harness sync` writes the bootstrap from the running tool and `harness check` fails when it is missing or differs, so a bootstrap fix reaches a repository that was already initialized.

`harness diff --manifest <path> --to <version>` previews the base files and compositions an upgrade changes. `harness gates` accepts `--jobs` and `--timeout`, and `--report` appends a JSON run summary that `harness metrics --log` reads into a first-pass rate.

A base release ships `requirements.json` declaring `requiredGates`, `requiredGovernance`, `recommendedGovernance`, `requiredPhases`, `recommendedPhases`, `requiredCiCommands`, and `requireOutputAssertions`. `harness check` loads the pinned release's requirements and fails when a required gate, governance key, or phase is missing; a recommended one is a `doctor` warning. A declared `governance.ci` file must contain each `requiredCiCommands` entry, so a consumer's CI runs the gates and proves them instead of keeping a second, drifting list. `harness diff` previews the capability delta of an upgrade.

The `release` phase is the convention for an application's own packaging check. The base recommends it but does not know the command: the repository declares a gate with `phase: "release"`, supplies its `prove_fires_command`, and `harness gates --phase release` runs it. A library without a packaging step is not forced to invent one.

`harness doctor --manifest <path>` checks the facts the manifest declares: the product version source and the documents that must agree with it, the sections and lifecycle status of each decision record, the sections and `Decision:` reference of each change record, a CODEOWNERS route for each declared owner, and each declared CI file's required commands. It also reports the adoption gap against the pinned release.

`harness gates --manifest <path>` runs every gate the manifest declares, so one list drives local runs and CI and the two cannot drift. A blocking failure exits non-zero; an advisory failure only warns. `harness scan --root <dir>` reports every manifest under a tree as ok, stale, diverged, or error. `harness prove --manifest <path>` runs a gate's `prove_fires_command`, requires the gate to fail, reverts, and requires it to pass; a gate whose action no longer fires exits non-zero.
