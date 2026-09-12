# 0011 — Gate phases: one list, a fast local subset

Status: implemented

## Problem

A repository declares one gate list for local runs and CI, but the heavy gates (integration, end-to-end, engine runs) make the list too slow to run on every local change. The usual response is a second, hand-maintained quick-check list, which drifts from the gate list and stops being trustworthy.

## Decision

A gate may declare a `phase`. `harness gates --phase <name>` runs the unphased gates plus the gates tagged with that phase; `harness gates` without `--phase` runs every declared gate. CI passes no phase, so it runs the whole list; a developer runs `--phase fast` to skip the gates tagged `full`. `harness prove` and the manifest's required gates are unaffected.

## Alternatives

- A separate local-only gate list: it drifts, and then two lists disagree about what is checked.
- A `--skip <id>` flag: it names what to skip, so a newly added slow gate is included by default and slows every run; a phase names what to run and keeps the fast set small by construction.
- Ordered tiers where `fast` implies `full`: an ordering the base must own and every repository must agree on; a free-form label is enough because only two sets matter.

## Consequences

- A gate tagged `full` does not run under `--phase fast`; CI, which passes no phase, still runs it, so nothing is dropped from the real check.
- `harness validate` rejects a `phase` that is not a non-empty string.
- The base does not assign phases to its own gates; the choice belongs to each repository's gate list.
