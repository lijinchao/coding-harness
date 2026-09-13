# Postmortem — the published schema and the validator disagreed

Date: 2026-09-12
Owner: @lijinchao

## Impact

Manifests the tool accepted could violate the published JSON schema. `governance.ci` was accepted from `0.1.12`, and `governance.changes` and `governance.manualVerification` from `0.1.13`, while `schema/harness.manifest.schema.json` — with `additionalProperties: false` — rejected all three. Anyone validating a manifest with the schema, such as an editor, saw errors the tool told them to ignore.

## Detection

An external maturity review compared the schema and the validator by reading both. No check failed, because nothing executed the schema.

## Timeline

- `0.1.12` — `governance.ci` added to the validator.
- `0.1.13` — `governance.changes` and `governance.manualVerification` added to the validator.
- `0.1.16` — the review reports the drift; `test/schema-agreement.test.mjs` is added and the schema is corrected.

## Root cause

The schema was declared normative but was documentation. `harness validate` implemented its own key lists, so the repository held two sources of truth and executed only one. Adding a key to the validator was easy; nothing connected that edit to the schema.

## Response

The validator exports its key groups, and a test asserts each group equals the schema's properties and required lists, so an edit to one side fails the suite. The schema gained the three keys it was missing.

## Regression test

Regression: test/schema-agreement.test.mjs

## Action items

- [x] Add the agreement test and correct the schema — @lijinchao, 0.1.16
- [x] Record the decision — docs/decisions/0014-schema-and-validator-one-contract.md
