# Shared harness base

The rules below are shared by every repository that pins this base. The repository's own commands and local rules are declared in the delta that follows.

## Conventions

- One change, one plan: commit a plan before implementation, and update it in the same commit when the implementation departs from it.
- A rule that must always hold belongs in a gate, not in a guide.
- When the same mistake happens twice, the correction goes into this base or the repository delta, not only into the code.
- State a target that can be checked without asking, for example: "the endpoint returns 200 with the new field".

## Things the agent gets wrong

- Do not edit generated files; edit the generator.
- Do not weaken or delete a test to make a change pass.
- Do not add a dependency without the owner's approval.
- Do not restate the repository's architecture from memory; read the code.

# Repository delta — payments-api

Everything above this file comes from the shared base. This file holds only what is true for this repository.

## Commands

- Build: `make build`
- Test: `make test`
- Integration test: `make itest` (needs Docker)

## Conventions

- Money is always `BigDecimal`, never `double`.
- Every new endpoint needs an integration test under `src/itest`.
- Kafka event schemas live in `schemas/`; generated classes are never edited.

## Things the agent gets wrong

- The `v1/` package is frozen; changes go in `v2/`.
- Dependency versions are owned by the platform team; do not bump them.
