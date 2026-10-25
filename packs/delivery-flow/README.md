# delivery-flow 0.1.0

An opt-in acceptance map for behavior changes. It references existing designs,
tests, commands, and review evidence. Node.js and a pinned `harness` executable
are required. No application runtime or model is supplied.

## Adoption

Release with `harness release --base packs/delivery-flow --out <registry>
--version 0.1.0`. Declare a `delivery-flow` pack from that registry and version,
then sync the consumer. The pack contributes one always-selected plan gate.
The consumer owns `scripts/check-delivery.mjs`, importing `main` from the
resolved, locked release's `check.mjs`, and `delivery.plan.json` at its root.
This repository demonstrates that adapter and a local, hashed release under
`dist/packs/delivery-flow`. No public pack tag has been published.

`delivery.schema.json` is the normative plan contract; the checker interprets
its used type, enum, pattern, required, array, and closed-object keywords.
Do not add other schema keywords without implementing their checks.
The gate expects the two declared consumer files; adopting it authorizes its
failure injection to empty and restore that specific tracked plan.

## Stages

Run `node scripts/check-delivery.mjs --manifest delivery.plan.json --stage
planned`. It checks constraints, a non-empty existing design, criterion/check
references, test files, scope, and coverage or a reasoned waiver for unit,
integration, and E2E. It does not execute the listed commands. Meaning and
waiver suitability still require review. Keep `design` pointing to the existing
ADR or product plan, rather than copying it.

For `--stage verified`, also supply `--revision <candidate SHA>` and
`--receipts <directory>`. Each check needs `<id>.red.json` and `<id>.green.json`
from `harness command-review`. Receipts stay outside the repository when
captured; the checker reuses `command-review-check`, never its own receipt
validator. An optional `--harness <absolute executable>` selects that adapter.
Baseline must be an ancestor, candidate must pass without tree changes, and
declared test files must be identical. Scope must still match the candidate.
Only declared scope is checked: it is not whole-product qualification.

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
