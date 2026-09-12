# AGENTS.md — coding-harness

Standing orders for a coding agent working in this repository.

## Commands

- Test: `npm test` — runs `node --test`; all green.
- Release the base: `node bin/harness.mjs release --base base --out dist` (version from `base/VERSION`).
- Check the example: `node bin/harness.mjs check --manifest examples/consumer/harness.manifest.json`
- Re-record the example after changing `base/`: bump `base/VERSION`, run `release`, then `node bin/harness.mjs upgrade --manifest examples/consumer/harness.manifest.json --to <version>`.

Run the tests and the example check before reporting any task complete, and paste the output.

## Conventions

- Zero runtime dependencies. The CLI is plain Node.js ESM; do not add a package without the owner's approval.
- The JSON schema in `schema/` is the normative manifest contract. `src/manifest.mjs` implements the required-field checks; when the schema grows a required field, add its check in the same change.
- Every artifact contract in `docs/reference.md` is enforced somewhere: a rule stated there without a check is a documentation bug.
- `examples/consumer/` is a generating repository. Change `base/`, re-run `release`, then upgrade/sync; never hand-edit `examples/consumer/AGENTS.md` or `REVIEW.md`.

## Adding a gate

Read `base/skills/writing-a-gate/SKILL.md` first. A gate without a `prove_fires` action that you have actually run is rejected by `harness validate`, and by review.

## Things the agent gets wrong

- Editing a composed output (`AGENTS.md`, `REVIEW.md`) instead of its source.
- Adding a guide for a failure that has not happened.
- Restating the reference in a second place instead of linking it.
