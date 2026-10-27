# delivery-flow 0.2.2

An opt-in acceptance map reusing project-owned behavior, tests and receipts.
Node.js and a pinned harness are required. No runtime or model is supplied.
Kernel fields do not change. Immutable 0.1.1 remains available; 0.2.2 reads
legacy delivery/v1 and strict delivery/v2 plans.

## Adoption

Release with `harness release --base packs/delivery-flow --out <registry>
--version 0.2.2`. Declare a `delivery-flow` pack from that registry and version,
then sync the consumer. The pack contributes one always-selected plan gate.
The consumer owns `scripts/check-delivery.mjs`, importing `main` from the
resolved, locked release's `check.mjs`, and `delivery.plan.json` at its root.
This repository demonstrates that adapter and a local, hashed release under
`dist/packs/delivery-flow`. No public pack tag has been published.

`delivery.schema.json` defines v2; `delivery-v1.schema.json` preserves v1.
The checker interprets their used type, enum, pattern, required, array and closed-object keywords.
Do not add other schema keywords without implementing their checks.
The gate expects the two declared consumer files; adopting it authorizes its
failure injection to empty and restore that specific tracked plan.

## Stages

Run `node scripts/check-delivery.mjs --manifest delivery.plan.json --stage
planned`. It checks constraints, a non-empty existing design, criterion/check
references, test files, scope, and coverage or a reasoned waiver for unit,
integration, and E2E. It does not execute the listed commands. Meaning and
waiver suitability still require review. Keep `design` pointing to the existing
ADR or product plan, rather than copying it. The following strict source/tier
rules apply only when the plan explicitly selects `coding-harness.delivery/v2`.

## Project-owned behavior and v2 tiers

Keep the existing design/requirement as the sole behavior source. Each criterion
adds `scenario: "AC-ONE"`, referring to `<!-- scenario: AC-ONE -->` in that file.
Markers must exist and be unique; fenced examples do not count. Both source and
plan must be canonical tracked regular files within scope. File names/directories
are project-owned. This initial representation supports text markers; other
native requirement formats can stay on v1 rather than copying a shadow spec.
The machine validates references, not scenario completeness or test adequacy.

v2 replaces tier_waivers with exactly one `tiers` record per unit/integration/e2e.
Each has `tier`, `status`, `reason`; status is covered, not_applicable,
not_evaluated or blocked. The last two also require follow_up. Covered declarations
need checks at that tier; planned reports them as not_evaluated with
declared_status=covered until receipts verify. Not-applicable with checks is
contradictory. Its structural reason still needs human review; a missing runner
or account is blocked, not a waiver. Missing/duplicate tier records fail.

Migration is explicit: select v2, keep design, add source markers/scenario refs,
scope source and plan, and replace each waiver with an assessed tier record.
There is no automatic waiver-to-not-applicable conversion. Legacy v1 keeps its
old interpretation, even for a weak waiver reason; that is not retrospective
proof of non-applicability. Old pack releases reject the new schema version.
Use 0.2.2 rather than the local 0.2.1 prerelease: v2 closed objects now reject
inherited property names such as constructor. The old artifact remains immutable.

For `--stage verified`, also supply `--revision <candidate SHA>` and
`--receipts <directory>`. Each check needs `<id>.red.json` and `<id>.green.json`
from `harness command-review`. Receipts stay outside the repository when
captured; the checker reuses `command-review-check`, never its own receipt
validator. An optional `--harness <absolute executable>` selects that adapter.
Baseline must be an ancestor, candidate must pass without tree changes, and
declared test files must be identical. Scope must still match the candidate.
Only declared scope is checked: it is not whole-product qualification.

v2 additionally binds plan bytes and behavior SHA-256 to that same candidate
revision. Source/plan drift invalidates old evidence. Unresolved blocked or
not_evaluated tiers retain reason/follow_up and prevent verified/accepted status.
Covered evidence is set only after receipts; not_applicable remains a declaration.
Planned can describe an incomplete plan but never claims verification_complete.

Save a deliberately selected red stdout or stderr as `<id>.red.stdout.txt` or
`<id>.red.stderr.txt`. Its bytes and hash must match the receipt and contain
the check's `expected_failure`. Timeouts and signals are never valid red
evidence. Review these logs before retaining them; they can contain secrets.
Choosing that diagnostic and judging its relevance are human responsibilities.

`--stage accepted --approval <file>` additionally checks a separately reviewed
decision containing `decision: accepted`, `reviewed_by`, `evidence` (the PR or
review reference), candidate `revision`, and the report's `plan_sha256`.
It reports `declared-accepted`, with reviewer authentication explicitly false.
Only protected repository review can authenticate the decision. The checker
never creates approval or authorizes merging. AI runs leave acceptance pending.

## Current limits

Capture uses existing commands, not a new execution engine. Dependency setup,
servers, Godot, real models, visual acceptance, and build artifacts need
project adapters and separate authority. No automatic metrics append is done:
an expected red observation must not count as a gate-health failure.
