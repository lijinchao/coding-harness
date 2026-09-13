# Contracts

Each artifact type has a required skeleton. `harness validate` rejects a manifest whose gates or skills omit a required field; `npm test` holds the JSON schema and the validator to one contract.

## Artifact contracts

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

A gate without `prove_fires` is not admissible. A blocking gate must also declare `prove_fires_command` and `revert_command`; `harness validate` rejects it otherwise and `harness prove` exits non-zero when the gate does not fire. A gate nobody has watched fail is not known to work. A proof is transactional: `harness prove` refuses to start unless the git working tree is clean, refuses to report success unless it is clean again after the revert, and runs every command with `--timeout`, so a revert that loses content is visible instead of silently destroying uncommitted work. Every path after the failure is introduced attempts the revert, including a failed introduction. The check sees only git-visible files: an ignored build cache that a revert damages is outside it. Pass `--timeout <s>` to bound each command; the generated CI does.

A gate passes only when its command exits zero, does not time out, and its output contains no line matching an `expect.forbid` pattern unless the line also matches an `expect.allow` entry. Exit code alone is not proof of a clean run; an engine that exits zero while printing errors fails such a gate. A base release may set `requireOutputAssertions: true` so a blocking gate without `expect.forbid` is rejected.

A gate may declare a `phase`. `harness gates --phase <name>` runs the unphased gates plus the gates in that phase, and `harness gates` without `--phase` runs every gate. Tag a slow gate `full` so a local `--phase fast` run skips it while CI, which passes no phase, still runs it.

A gate whose `needs` dependency fails or is skipped is itself skipped and reported `skip`, so a broken prerequisite never looks like a passing check; `after` orders gates without propagating failure. `harness validate` rejects an unknown dependency and a dependency cycle, `harness gates --fail-fast` starts no new gate after a blocking gate fails, and `harness select` includes the dependencies of every gate it selects.

A gate's command runs under a shell in its own process group. On timeout the runner signals the group with `SIGTERM`, then `SIGKILL` after five seconds, and forwards `SIGINT` and `SIGTERM` before exiting, so a timed-out gate leaves no children. A result reports exit code, signal, timeout, and duration separately; `--report` records the timeout and duration per gate.

### Proof isolation

| Field | Meaning |
|---|---|
| `governance.proofCarry` | Untracked paths a proof worktree must carry |

`harness prove --isolated` runs the proof in a temporary `git worktree` instead of the working tree, so a proof never dirties the checkout it proves. `.harness` and `node_modules` are symlinked into the worktree, and each `governance.proofCarry` path with them, so a pin that resolves only from the local cache still resolves.

### Evidence surface

| Field | Meaning |
|---|---|
| `id` | Stable identifier |
| `paths` | Repository-relative globs this surface covers |
| `requires` | The gate ids a change to those paths requires |

A manifest may declare `surfaces`. `harness select --manifest <path> (--since <ref> | --changed <path>)` prints the gate ids a change selects: the union of the surfaces its changed files match, plus every gate marked `always: true`. `harness gates --changed <path>` and `harness gates --since <ref>` run that set; `harness gates` without a selection runs every gate, which is what CI should do. `harness validate` rejects a surface that requires an unknown gate, and a gate that no surface requires and that is not `always`, so a new gate cannot silently fall outside the matrix. `harness doctor` also requires every committed file to be matched by some surface, so a change to an unowned file cannot select nothing; a repository may declare an explicit catch-all. Without `surfaces`, selection is every gate. Name an evidence gate by its tier — `unit-*`, `integration-*`, `e2e-*` — so `requires` names the evidence rather than the tool that produces it.

### Document health

| Field | Meaning |
|---|---|
| `governance.docs` | Documents whose links, word budget, and forbidden text are checked |
| `governance.instructions` | Globs for every instruction file an agent can read |

`harness doctor` checks that each declared document exists, that its relative Markdown links resolve (a fragment must name a heading in the target), and that it stays within its `maxWords` budget, and rejects a line matching one of the document's `forbid` patterns unless it also matches `allow`. It also walks the repository for `AGENTS.md` and `AGENTS.delta.md`, and fails when a file is not matched by `governance.instructions` or when a declared glob matches no file. A budget forces relocation instead of accumulation, and an unmanaged instruction file is a rule nobody governs; both keys are recommended.

### Guide section

| Field | Meaning |
|---|---|
| `rule` | The instruction, one or two lines |
| `rationale-link` | Where the reason lives |
| `owner` | Who changes it |

### Decision record

| Field | Meaning |
|---|---|
| `status` | `proposed`, `accepted`, `implemented`, `superseded`, or `rejected` |
| `problem` | The motivation, written to stand alone |
| `decision` | What was decided |
| `alternatives` | Each real alternative and why it lost |
| `consequences` | What the decision cost and bought |

A record declares its status as a `Status: <value>` line or a `## Status` section. `proposed` is a plan not yet authorized, so an in-repository plan is a proposed decision rather than a separate document; `accepted` is decided but not built; `implemented` is the current mechanism; `rejected` was considered and declined. A `superseded` record names its replacement with `Superseded-by: <path>`, which must exist, and `Supersedes:` is checked the same way. A decision records a choice that outlives the change; what changed lives in git.

`harness validate` loads each declared skill file and rejects it when the frontmatter lacks `name` or `description`, or when it lacks any of `## Inputs`, `## Steps`, `## Verification`, `## Failure`. A gate's `command` must be non-empty and a single line. The base ships `templates/decision-record.md` and `templates/postmortem.md` for the two record types.

### Change record

| Field | Meaning |
|---|---|
| `verification` | The command and the output that show the change worked |
| `context` | Optional: what the change is and why now |
| `decision` | Optional `Decision: <path>` naming the record this change implements |

A repository that declares `governance.changes` keeps one record per change under that directory. `harness doctor` requires `## Verification` and resolves a `Decision:` line when it is present. The record carries the evidence git cannot: what was decided lives in `docs/decisions/`, and what changed lives in git. The base ships `templates/change-record.md`.

### Manual verification

| Field | Meaning |
|---|---|
| `target` | The person observed and what they were trying to do |
| `task` | The concrete task they attempted |
| `observation` | What happened, including friction and abandonment |
| `decision` | What the observation changes |

Automated verification stays at the unit, integration, and end-to-end tiers. A manual verification record is the product-experience counterpart for what no test asserts. `governance.manualVerification` is recommended, not required: `harness doctor` checks only that the declared path exists and emits a warning when the key is absent, so the gap is visible without blocking unrelated work. The base ships `templates/manual-verification.md`.

### Postmortem

| Field | Meaning |
|---|---|
| `impact` | What broke, for whom, and for how long |
| `root-cause` | The cause, not the trigger |
| `response` | What happened, and what worked or did not |
| `regression` | The permanent check that now catches it |
| `action-items` | Follow-ups, with owners |

A repository that declares `governance.postmortems` keeps one record per incident. `harness doctor` requires `## Impact`, `## Root cause`, `## Response`, `## Regression test`, and `## Action items`, and resolves every `Regression: <gate id or path>` line against the manifest's gates and the working tree: an incident that leaves no check is not closed.

## Verification tiers

Unit, integration, and end-to-end: pick the cheapest tier that fails when the change is reverted. `skills/verification-tiers/SKILL.md` owns the procedure. Manual verification is not a fourth tier; it records the product experience no check asserts.
