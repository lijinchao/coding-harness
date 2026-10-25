# Shared harness base

The rules below are shared by every repository that pins this base. The repository's own commands and local rules are declared in the delta that follows.

## Conventions

- Keep the entrypoint a short map to authoritative sources; read task-specific details when needed.
- One change, one plan: commit a plan before implementation, and update it in the same commit when the implementation departs from it.
- A rule that must always hold belongs in a gate, not in a guide.
- When the same mistake happens twice, the correction goes into this base or the repository delta, not only into the code.
- State a target that can be checked without asking, for example: "the endpoint returns 200 with the new field".

## Things the agent gets wrong

- Do not edit generated files; edit the generator.
- Do not weaken or delete a test to make a change pass.
- Do not add a dependency without the owner's approval.
- Do not restate the repository's architecture from memory; read the code.
