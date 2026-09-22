# 0013 — Make the harness govern its own product claims

## Context

The working CLI has outgrown its README and direction documents while its
own `doctor` remains green: it checks version strings, links and document
shape, but not the relationship between shipped commands and product status.
The multi-repository Shadow history also mixes snapshots with the same system
ID. GitLab observation currently combines API facts with one team's approval
and pipeline policy; initialization assumes GitHub; external-service hint
patterns are duplicated across three modules.

## Plan

1. Bind system CI history to the current pinned snapshot identity. Keep the
   history advisory; reject legacy/unbound observations from the stability
   window. Test that a second change under the same system ID cannot inherit
   the first change's promotion count.
2. Separate GitLab transport/identity observation from optional policy
   evaluation. Preserve a conservative default for existing target files,
   make alternate workflow choices explicit in the targets contract, and
   record what was observed separately from whether the policy passed.
3. Make `init`'s Git host and CI provider explicit. Render reviewed provider
   scaffolds without a hard-coded public GitHub source in the generic path.
4. Unify the duplicated external-service hints as advisory detection; retain
   explicit execution authority and document that a command-name scan cannot
   prove no egress.
5. Add a product-status consistency check to this repository's own governance
   path: the documented CLI inventory must match the executable command table,
   and current-capability claims must use one status inventory with evidence.
   Correct README, direction and roadmap; prove the new check fails on drift.

## Verification

- Focused tests for history isolation, GitLab policy, init providers and
  product-status drift.
- `npm test`
- `./harness doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`
- `git diff --check`

The current changes are to the working tool, not a new pinned base release.
Real GitLab compatibility and trusted CI provenance remain separate rollout
checks.

## Result

- System CI reports now bind Change ID and manifest SHA-256. The advisory
  history window ignores old reports lacking those fields and reports from a
  different pinned change, even when the system ID is unchanged.
- GitLab results distinguish a consistent API observation (`observed`) from
  the declared policy result (`ok`). The existing strict approval and MR
  Pipeline policy remains the default; target files can explicitly choose an
  observation-only approval policy or a successful MR head Pipeline on the
  source SHA. Required Jobs remain mandatory.
- `init` now requires an explicit base source and CI provider. GitLab gets a
  native CI file and root CODEOWNERS; conflicting re-initialization fails
  before writing. The external-service hint is shared across the three call
  sites and documented as an incomplete signal.
- README is the current command and release-status inventory. A repository
  test compares every documented command with the live CLI and compares
  working-only commands with the pinned tool commit. Documentation changes
  select the test gate. Direction and roadmap link to that inventory.

Verification: `npm test` 227/227, self `doctor` and `validate` OK, pinned
example `check` OK, and `git diff --check` clean. A missing command row and
an older snapshot were exercised as negative controls. These tests catch
command/status inventory drift, but cannot prove every semantic product claim;
human review still owns the meaning of capability and deployment status.
