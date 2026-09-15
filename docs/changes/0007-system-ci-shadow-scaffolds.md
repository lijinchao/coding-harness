# System CI Shadow scaffolds

Decision: docs/decisions/0041-system-ci-templates-are-reviewable-scaffolds.md

## Context

`system-ci` now emits current health and advisory history statistics, but teams
must still hand-write provider YAML and agree where receipts, restored history,
and the current report live. A generic template cannot safely guess sibling
repository checkout credentials or how a CI installation retrieves artifacts
from an earlier pipeline.

## Plan

1. Define a JSON Schema and executable field checks for the archived
   `coding-harness.system-ci/v1` report contract.
2. Normalize missing and malformed receipt entries so every report has the same
   machine-readable shape.
3. Use the report contract when accepting historical observations; malformed or
   foreign reports remain ignored advisory inputs.
4. Add reviewable GitHub Actions and GitLab CI Shadow templates with one shared
   artifact layout for receipts, restored history, and the current report.
5. Add `system-ci-template --provider github|gitlab [--out <path>] [--force]`
   to print or explicitly write a scaffold without modifying a repository by
   default.
6. Prove templates never contain `--enforce`, archive the current report even
   when a step fails, do not claim to restore prior artifacts or checkout
   sibling repositories, and refuse accidental overwrite.

## Verification

- `node --test test/system.test.mjs test/system-ci-template.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`
- Render and inspect both provider scaffolds; no repository installation.
