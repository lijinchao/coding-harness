# 0005 — A governance-consistency gate

Status: implemented
Date: 2026-09-12

## Problem

The tool detected generated-file drift but not governance-fact drift. During the hardening release
the README still named an old version, the roadmap contradicted itself, and a blocking gate shipped
without an executable proof; all of that passed every gate.

## Decision

- `harness doctor --manifest <path>` checks the facts a manifest declares under `governance`:
  files that must name the pinned version, the sections of each decision record, and a CODEOWNERS
  route for each declared owner.
- `lock.proofs` may only reference gates that exist.
- This repository runs `./harness doctor` as a declared gate and `./harness prove` in CI.

## Alternatives

- **Hard-code checks for README and the roadmap.** Rejected: they are repository-specific; the
  manifest declares the files instead.
- **A separate governance linter outside the manifest.** Rejected: it would be a second source of
  truth for the same facts.

## Consequences

- A consumer opts in by adding a `governance` section; `doctor` is a no-op without one.
- The base owner is routed through `.github/CODEOWNERS`.
