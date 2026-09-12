# 0002 — The base carries transferable rules only

Status: implemented
Date: 2026-09-12

## Problem

The released base (`base@0.1.0`) declared a `## Commands` section with `make build`,
`make test`, and `make lint`. A real consumer (a Godot project) has no `make` targets, so
every composed `AGENTS.md` opened with commands the repository cannot run. The content was
low-value at best and actively misleading to an agent that followed it.

## Decision

- The base carries only rules that transfer to every consumer: conventions and recurring
  failure modes.
- Repository commands belong in the repository delta. The base says the delta declares them and
  names no build tool.
- A composed `AGENTS.md` therefore leads with transferable rules and then the repository's own
  commands.

## Alternatives

- **Keep the commands as placeholders and require the delta to override them.** Rejected: the
  composed file still shows commands that do not exist until a reader notices the override.
- **Delete the base and have each repository write its own guide.** Rejected: it drops the shared
  layer this project exists to keep single-sourced.
- **Move the commands into a new artifact the delta must provide.** No such artifact exists; a
  section in the delta is the smallest carrier that works.

## Consequences

- `base@0.1.1` removes the `## Commands` section; the example consumer and the Godot consumer
  declare their commands in their deltas.
- Base and tool versions move together for now, so both are `0.1.1`.
