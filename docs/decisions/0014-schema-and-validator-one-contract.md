# 0014 — The schema and the validator are one contract

Status: implemented

## Problem

`schema/harness.manifest.schema.json` is the declared normative manifest contract, but nothing executes it: `harness validate` implements its own key lists in `src/manifest.mjs`. The two drifted. The validator accepted `governance.ci`, `governance.changes`, and `governance.manualVerification` while the schema, with `additionalProperties: false`, rejected them, so a manifest the tool generated and accepted could violate the published contract without any check failing.

## Decision

Keep both artifacts and hold them together with a test. `src/manifest.mjs` exports its key groups and required-field lists; `test/schema-agreement.test.mjs` asserts each group equals the schema's corresponding `properties` and `required` arrays. Adding a manifest field means updating the validator and the schema; the test fails on any drift, and `npm test` is a gate.

## Alternatives

- Parse the schema at runtime and derive the validator's rules from it: the tool would depend on the schema's location in every checkout, and the schema expresses constraints the validator would still have to interpret.
- Generate the schema from the validator: the schema is the published contract and should be readable and editable on its own; generating it hides the contract behind code.
- Delete the schema and let the validator be the only contract: consumers and editors lose a machine-readable schema, and the drift just moves into the documentation.

## Consequences

- The schema and the validator can no longer disagree silently; drift fails `npm test`.
- The schema gained the three governance keys it was missing.
- The test covers key groups and the skill and gate required fields, not full JSON-Schema semantics such as types, enums, and `minLength`; the validator still owns those.
