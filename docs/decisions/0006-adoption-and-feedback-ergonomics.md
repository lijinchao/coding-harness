# 0006 — Adoption and feedback ergonomics

Status: implemented
Date: 2026-09-12

## Problem

Adoption still needed several manual steps: `init` wrote a manifest whose base source did not
exist and whose gates had no executable proof, so the result was not green; there was no way to
preview an upgrade; a stopping gate had no timeout; and the effectiveness signals the roadmap asks
for had no collection path.

## Decision

- `harness init` scaffolds the delta, manifest, bootstrap, `.gitignore`, and a CI workflow, then
  composes the repository; the result is green when the base source resolves. The default base
  source is this project's release repository, overridable with `--base-source`.
- `harness diff --manifest <path> --to <version>` previews the base files and compositions an
  upgrade changes.
- `harness gates` accepts `--jobs <n>` and `--timeout <s>`, and `--report <file>` appends a JSON
  run summary. `harness metrics --log <file>` reads those into a first-pass rate and per-gate
  failures.

## Alternatives

- **Leave `init` as a manifest writer.** Rejected: the point of a scaffold is a working harness,
  not a file.
- **Store metrics inside the tool.** Rejected as speculative; a JSONL report the CI already
  produces is the smallest collection path, and the tool stays stateless.

## Consequences

- `init` reaches a green `harness check` when the base source resolves; otherwise it prints the
  one command to run once it does.
- Metrics depend on a CI step passing `--report`; without it, `metrics` reports zero runs.
