# Contracts

Each artifact type has a required skeleton. `harness validate` rejects a manifest whose gates or skills omit a required field; `npm test` holds the JSON schema and the validator to one contract.

## Artifact contracts

### System manifest

| Field | Meaning |
|---|---|
| `repositories` | Repository id, role, checkout path, and full Git revision |
| `contracts` | Producer, consumers, and repository-owned evidence path |
| `verifications` | Reviewed command, repository, tier, and external-service boundary |

`system-check` rejects unknown or duplicate identifiers, dangling repository
references, escaping evidence paths, wildcard or multiline commands, and an
external command outside `external-qualified`. It reports missing repositories,
revision drift, dirty trees, missing evidence, and unresolved executables
without running a command. Every repository needs a reviewed verification.
`declared-ready` proves only snapshot alignment and evidence presence; command success remains unproved.
The complete format is in [system-manifest.md](system-manifest.md).
An unresolved member uses `revision: null` and prevents readiness.
`system-snapshot` binds explicit revisions outside member repositories; it
neither approves revisions nor runs commands. See [system-manifest.md](system-manifest.md).

### Command review receipt

| Field | Meaning |
|---|---|
| `repository` | Source repository path and exact committed revision exported for review |
| `command` | Exact single-line candidate command |
| `result` | Outcome, timeout, duration, and output hashes without raw output |
| `filesystem` | Hashes and changed paths inside the isolated export |
| `observability` | Explicit boundaries that were compared or remain unobserved |
| `authorizes_verification` | Always `false`; the receipt cannot replace human review |

`command-review` runs committed files from an exact revision in a temporary
archive. Tree changes become `mutated`; external commands need explicit
authority. Network, child processes, and outside-tree writes remain unobserved.
`command-review-check` verifies repository, revision, and command identity
without rerunning. See [command-review.md](command-review.md).

### System receipt

| Field | Meaning |
|---|---|
| `manifest` | Portable SHA-256 of the system declaration |
| `repositories` | Exact revision combination used by the run |
| `results` | Command identity, outcome, timeout, duration, and output hashes |

`system-run` requires a ready snapshot and writes a receipt after passing or
failing commands. `system-receipt-check` rejects manifest, revision, tier-command,
or result drift without rerunning the tier. Receipt output stays outside every
declared repository. External qualification additionally requires
`--allow-external`; a manifest declaration alone is not execution authority.

### System CI observation

`qualification.required_tiers` is the non-empty set of receipts a system needs.
`qualification.max_receipt_age_seconds` is the CI freshness budget. Promotion
criteria declare a bounded history window, minimum observations, minimum
healthy rate, and minimum current healthy streak.
`system-ci` reads the system snapshot and `<tier>.receipt.json` files without
running commands. An optional history directory supplies earlier reports for
advisory stability statistics; malformed, future, or foreign-system entries are
ignored and counted. Shadow mode always exits zero while reporting whether it
would block; `--enforce` makes the current unhealthy result non-zero. History
eligibility cannot enable enforcement or override current evidence.
Archived observations conform to `schema/system-ci-report.schema.json`; every
receipt summary has a normalized shape even when evidence is absent or
malformed. History accepts only complete reports for the same system.

The GitHub and GitLab scaffolds share `.harness/system-ci/receipts`,
`.harness/system-ci/history`, and
`.harness/system-ci/current/system-ci.json`. They archive current evidence but
only document the provider-specific checkout and prior-artifact restoration
steps; those deployment facts are never inferred.

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

A gate without `prove_fires` is not admissible. A blocking gate must also declare `prove_fires_command` and `revert_command`; `harness validate` rejects it otherwise and `harness prove` exits non-zero when the gate does not fire. A gate nobody has watched fail is not known to work. A proof is transactional: it refuses to start unless the git working tree is clean, refuses to report success unless it is clean again, and every path after the introduction attempts the revert, including a failed introduction. It sees only git-visible files, so a revert that damages an ignored cache is invisible to it; an isolated proof reports the carried state it changed instead. `--timeout <s>` bounds each command; the generated CI passes one.

A gate passes only when its command exits zero, does not time out, and its output contains no line matching an `expect.forbid` pattern unless it also matches an `expect.allow` entry. Exit code alone is not proof of a clean run; an engine that exits zero while printing errors fails such a gate. A base release may set `requireOutputAssertions: true` so a blocking gate without `expect.forbid` is rejected.

A gate may declare a `phase`: `harness gates --phase <name>` runs the unphased gates plus that phase; no `--phase` runs every gate. Tag a slow gate `full` so a local `--phase fast` run skips it while CI, which passes no phase, runs it.

A gate whose `needs` dependency fails or is skipped is itself skipped and reported `skip`, so a broken prerequisite never looks like a passing check; `after` orders gates without propagating failure. `harness validate` rejects an unknown dependency and a cycle, `--fail-fast` starts no new gate after a blocking failure, and `harness select` includes dependencies.

A gate's command runs under a shell in its own process group. On timeout the runner signals the group with `SIGTERM`, then `SIGKILL` after five seconds, and forwards `SIGINT` and `SIGTERM` before exiting, so a timed-out gate leaves no children. A result reports exit code, signal, timeout, and duration separately; `--report` records timeout and duration per gate.

### Proof isolation

| Field | Meaning |
|---|---|
| `governance.proofCarry` | Untracked paths a proof worktree must carry |

`prove --isolated` runs the proof in a temporary `git worktree`, so it never dirties the checkout it proves. `.harness` and `node_modules` are carried into the worktree, and each `governance.proofCarry` path with them, so a pin that resolves only from the local cache still resolves. The proof reports the carried state it changed: a file modified or removed fails the run and is named, while added files are reported as cache growth.

### Proof record

| Field | Meaning |
|---|---|
| `at` | When the gate was watched to fail and pass |
| `tool` | The tool commit that ran the proof |
| `definition` | SHA-256 of the gate's behavioural fields |

`prove --record` writes one record per proved gate to `lock.proofs`. A repository that declares `governance.proofs` — `require`: `blocking`, `all`, or `none`, and `maxAgeDays` (default 30) — has `harness prove` refuse a gate in scope whose record is missing, unbound, or no longer current.

### Evidence surface

| Field | Meaning |
|---|---|
| `id` | Stable identifier |
| `paths` | Repository-relative globs this surface covers |
| `requires` | The gate ids a change to those paths requires |

A manifest may declare `surfaces`. `harness select --manifest <path> (--since <ref> | --changed <path>)` prints the gate ids a change selects: the union of the surfaces its files match plus every `always: true` gate; `harness gates --changed` and `--since` run that set, and no selection runs every gate, which is what CI should do. `harness validate` rejects a surface requiring an unknown gate, and a gate no surface requires unless it is `always`, so no gate falls outside the matrix. `harness doctor` also requires every committed file to be matched by a surface, so a change to an unowned file cannot select nothing; a repository may declare a catch-all. Without `surfaces`, selection is every gate.

### Metrics budget

| Field | Meaning |
|---|---|
| `governance.metrics` | The committed log of gate runs a window budget judges, and its limits |

`harness metrics --manifest <path>` judges `minFirstPassRate`, `maxFlaky`, and `maxTimeouts` over the last `window` runs (default 20) and names each breach; [reference.md](reference.md) owns the commands and the reason duration is reported, not budgeted.

### Document health

| Field | Meaning |
|---|---|
| `governance.docs` | Documents whose links, word budget, and forbidden text are checked |
| `governance.instructions` | Globs for every instruction file an agent can read |

`harness doctor` checks that each declared document exists, that its relative links resolve (a fragment must name a heading), and that it stays within `maxWords`, and rejects a line matching a `forbid` pattern unless it also matches `allow`. It walks the repository for `AGENTS.md` and `AGENTS.delta.md` and fails when a file is unmatched by `governance.instructions` or a declared glob matches nothing. A budget forces relocation instead of accumulation, and an unmanaged instruction file is a rule nobody governs; both keys are recommended.

### Decision record

| Field | Meaning |
|---|---|
| `status` | `proposed`, `accepted`, `implemented`, `superseded`, or `rejected` |
| `problem` | The motivation, written to stand alone |
| `decision` | What was decided |
| `alternatives` | Each real alternative and why it lost |
| `consequences` | What the decision cost and bought |

A record declares its status as a `Status: <value>` line or a `## Status` section: `proposed` is decided-not-authorized, `accepted` is decided but not built, `implemented` is the current mechanism, `rejected` was declined. A `superseded` record names its replacement with `Superseded-by: <path>`, which must exist; `Supersedes:` is checked the same way. A decision records a choice that outlives the change; what changed lives in git.

`harness validate` loads each declared skill file and rejects it when the frontmatter lacks `name` or `description`, or any of `## Inputs`, `## Steps`, `## Verification`, `## Failure`. A gate's `command` must be non-empty and a single line. The base ships `templates/decision-record.md` and `templates/postmortem.md` for the two record types.

### Change record

| Field | Meaning |
|---|---|
| `verification` | The command and the output that show the change worked |
| `context` | Optional: what the change is and why now |
| `decision` | Optional `Decision: <path>` naming the record this change implements |

A repository that declares `governance.changes` keeps one record per change there. `harness doctor` requires `## Verification` and resolves a `Decision:` line when present. The record carries the evidence git cannot: decisions live in `docs/decisions/`, the change lives in git. The base ships `templates/change-record.md`.

### Manual verification

| Field | Meaning |
|---|---|
| `target` | The person observed and what they were trying to do |
| `task` | The concrete task they attempted |
| `observation` | What happened, including friction and abandonment |
| `decision` | What the observation changes |

Automated verification stays at unit, integration, and end-to-end tiers; a manual verification record is the product-experience counterpart for what no test asserts. `governance.manualVerification` is recommended, not required: `harness doctor` checks only that the declared path exists and warns when the key is absent, so the gap is visible without blocking unrelated work. The base ships `templates/manual-verification.md`.

### Postmortem

| Field | Meaning |
|---|---|
| `impact` | What broke, for whom, and for how long |
| `root-cause` | The cause, not the trigger |
| `response` | What happened, and what worked or did not |
| `regression` | The permanent check that now catches it |
| `action-items` | Follow-ups, with owners |

A repository that declares `governance.postmortems` keeps one record per incident. `harness doctor` requires `## Impact`, `## Root cause`, `## Response`, `## Regression test`, and `## Action items`, and resolves every `Regression: <gate id or path>` against the manifest's gates and the tree: an incident that leaves no check is not closed.

## Verification tiers

Unit, integration, and end-to-end: pick the cheapest tier that fails when the change is reverted. `skills/verification-tiers/SKILL.md` owns the procedure. Manual verification is not a fourth tier; it records the product experience no check asserts.
