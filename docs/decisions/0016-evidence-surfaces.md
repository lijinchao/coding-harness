# 0016 — Evidence surfaces select the smallest sufficient gate set

Status: implemented

## Problem

One gate list drives local runs and CI, but nothing connects a changed file to the evidence it needs. An agent either runs every gate (slow) or guesses which ones matter (unsound), and a gate added later is invisible until someone remembers to run it. A second, hand-maintained quick-check list would drift from the gate list.

## Decision

A manifest may declare `surfaces`: a surface names path globs and the gate ids a change to those paths requires. `harness select --since <ref>` or `--changed <path>` prints the union over the changed files plus the gates marked `always: true`; `harness gates --since <ref>` runs that set, while `harness gates` with no selection runs every gate and stays the CI default. `harness validate` rejects a surface requiring an unknown gate and a gate no surface requires that is not `always`, so every gate is reachable from the matrix. Evidence kinds are gate ids such as `unit-tests` or `e2e-godot`, not a second vocabulary. Without `surfaces`, selection is every gate.

## Alternatives

- A second local-only check list: it drifts from the gate list, which is the failure this project exists to prevent.
- Evidence kinds separate from gates: two vocabularies that must be mapped to each other, and no command to run for a kind.
- Require `surfaces` in every base release: a small repository with two gates gains configuration without gaining information; the base can require it later, once a consumer's matrix is real.

## Consequences

- A change runs the smallest set its touched surfaces require, and CI still runs the full set.
- A gate outside the matrix fails validation instead of being silently skipped.
- The globs are the repository's own statement of which paths touch which evidence; a wrong glob is a wrong selection until someone fixes it.
