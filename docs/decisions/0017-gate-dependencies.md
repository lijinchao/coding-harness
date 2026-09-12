# 0017 — Gate dependencies: needs, after, and skipped results

Status: implemented

## Problem

Gates ran as a flat list. A gate that consumes another's output could run before it, or run after the other failed and produce a second, confusing failure. Nothing recorded that a gate was deliberately not run, and a failing gate did not stop a long run that could no longer succeed.

## Decision

A gate may declare `needs` (gate ids that must pass) and `after` (gate ids that must finish first, whose failure does not skip it). `runGates` schedules gates whose dependencies have settled, up to `--jobs` in parallel; a gate with a failed or skipped blocking dependency is itself skipped and reported `skip` with a reason. `--fail-fast` starts no new gate after a blocking gate fails. `harness select` pulls in the dependencies of every gate it selects, so a selected gate never runs without its prerequisites. `harness validate` rejects an unknown dependency and a dependency cycle.

## Alternatives

- A single `depends_on` with failure propagation: ordering-only edges are real — a formatter and a linter order against each other without one skipping the other.
- A separate pipeline file, such as a Makefile or a CI graph: it duplicates the gate list, which is the drift this project exists to prevent.
- Stop the whole run on the first failure without a flag: parallel gates already in flight still finish, and a `skip` record is more honest than an unexplained absence.

## Consequences

- A dependency failure produces one failure and a set of `skip` records, not a cascade of confusing failures.
- `skip` never counts as a blocking failure, so the exit code still reflects the real failures.
- A cycle or an unknown dependency fails validation instead of deadlocking the scheduler.
- `--fail-fast` trades coverage for time; CI should run without it.
