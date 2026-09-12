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

Each artifact type has a required skeleton. `harness validate` rejects a manifest whose gates or skills omit a required field.

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
| `severity` | `blocking` or `advisory` |

A gate without `prove_fires` is not admissible. A blocking gate must also declare `prove_fires_command` and `revert_command`; `harness validate` rejects it otherwise and `harness prove` exits non-zero when the gate does not fire. A gate nobody has watched fail is not known to work.

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

A manifest may pin `tool.version`. A committed bootstrap fetches the tool at tag `v<version>` and runs it; the lock records the tool version and a SHA-256 per tool source file, and a running tool that differs from either fails. CI needs no checkout of the tool repository.

`harness check` fails when a composed output no longer matches the pin, when a fetched base file differs from its release record, or when it differs from the `lock.base` hashes. `harness sync` refuses to accept a base that differs from the lock.

An upgrade is explicit. `harness upgrade --to <version>` moves the pin and re-syncs, and the repository's own checks must pass before the bump merges. Editing a released base version in place is a broken pin, not an upgrade.

`harness release` refuses to overwrite an existing `base@<version>`; bump `base/VERSION` or pass `--force`. `harness sync` and `harness upgrade` resolve, verify, and compose before writing anything, and commit each file by rename, so a failed upgrade leaves the previous state intact.

`harness gates --manifest <path>` runs every gate the manifest declares, so one list drives local runs and CI and the two cannot drift. A blocking failure exits non-zero; an advisory failure only warns. `harness scan --root <dir>` reports every manifest under a tree as ok, stale, diverged, or error. `harness prove --manifest <path>` runs a gate's `prove_fires_command`, requires the gate to fail, reverts, and requires it to pass; a gate whose action no longer fires exits non-zero.
