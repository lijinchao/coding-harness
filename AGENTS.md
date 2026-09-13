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

# Repository delta — coding-harness

Everything above this file comes from the shared base. This file holds only what is true for this repository.

> This file is the source for the composed `AGENTS.md`; `REVIEW.md` comes from the base alone. Run `./harness sync` after editing it.

## Commands

- Test: `npm test` — runs `node --test`; all green.
- Release the base: `node bin/harness.mjs release --base base --out dist` (version from `base/VERSION`).
- Validate a manifest: `./harness validate --manifest <path>`
- Check the example: `./harness check --manifest examples/consumer/harness.manifest.json`
- Re-record the example after changing `base/`: bump `base/VERSION`, run `release`, then `./harness upgrade --manifest examples/consumer/harness.manifest.json --to <version>`.

Run the tests and the example check before reporting any task complete, and paste the output.

## Conventions

- Zero runtime dependencies. The CLI is plain Node.js ESM; do not add a package without the owner's approval.
- The JSON schema in `schema/` is the normative manifest contract. `src/manifest.mjs` implements the required-field checks; when the schema grows a required field, add its check in the same change.
- Every artifact contract in `docs/contracts.md` is enforced somewhere: a rule stated there without a check is a documentation bug.
- `examples/consumer/` is a generating repository. Change `base/`, re-run `release`, then upgrade/sync; never hand-edit `examples/consumer/AGENTS.md` or `REVIEW.md`.

## Adding a gate

Read `base/skills/writing-a-gate/SKILL.md` first. `./harness validate` rejects a blocking gate that does not declare both `prove_fires_command` and `revert_command`, and `./harness prove` refuses to guess a revert. A gate nobody has watched fail is a dead gate.

## Things the agent gets wrong

- Editing a composed output (`AGENTS.md`, `REVIEW.md`) instead of `AGENTS.delta.md`.
- Adding a guide for a failure that has not happened.
- Restating the reference in a second place instead of linking it.
