# Shared harness base

This file is composed into a repository's `AGENTS.md` above the repository delta. Edit the base in the shared harness repository, never in a consuming repository.

## Commands

- Build: `make build` — must end with `Build succeeded`.
- Test: `make test` — all green; never delete or skip a failing test.
- Lint: `make lint` — zero warnings.

Run all three before reporting any task complete, and paste the output.

## Conventions

- One change, one plan: commit a plan before implementation, and update it in the same commit when the implementation departs from it.
- A rule that must always hold belongs in a gate, not in this file.
- When the same mistake happens twice, the correction goes into this base or the repository delta, not only into the code.
- State a target that can be checked without asking, for example: "the endpoint returns 200 with the new field".

## Things the agent gets wrong

- Do not edit generated files; edit the generator.
- Do not weaken or delete a test to make a change pass.
- Do not add a dependency without the owner's approval.
- Do not restate the repository's architecture from memory; read the code.
