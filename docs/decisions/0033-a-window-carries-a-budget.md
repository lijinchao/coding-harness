# 0033 — A window of recorded runs carries a quality budget

Status: implemented

## Problem

`harness metrics` reported the first-pass rate, duration percentiles, skips, timeouts, and flakiness, and nothing acted on them: a gate that failed in half the recorded runs, or timed out twice, was visible only to whoever read the report. A metric without a threshold is an observation, not a control, and this repository's rule is that a rule which must hold belongs in a gate. The gap was two-sided: no budget could be declared, and no command failed when one was breached.

## Decision

A repository declares `governance.metrics`: the committed JSONL log of gate runs, the `window` of recent runs the budget judges (default 20), and any of `minFirstPassRate`, `maxFlaky`, and `maxTimeouts` it wants to hold. `harness metrics --manifest <path>` evaluates the window and exits non-zero naming each breach, so a `metrics` gate in the manifest makes the budget blocking; `harness metrics --log <file>` keeps reporting a single run. A run is recorded by pointing `gates --report` at the committed log, which keeps recording an explicit operator act rather than something CI does invisibly to a file nobody reviews. Duration percentiles stay reported and unbudgeted: the same gate times differently on different runners, so a p95 threshold would fail on hardware rather than on a regression.

## Alternatives

- Budget p95 duration: the review's example, and refused above — the signal is dominated by runner and load.
- Judge only the current run: one red run is not a rate, and a budget needs a window to tell a regression from a bad afternoon.
- Let CI append to the committed log: CI cannot commit, so the file would change without review, and `prove` in the same workflow refuses a dirty tree.
- Require the budget in every consumer: a threshold is a repository's own risk appetite; the base recommends the key and `doctor` warns when it is absent, like the other recommended artifacts.

## Consequences

- A gate that flakes, times out, or drags the first-pass rate below the floor fails a gate instead of waiting to be noticed.
- The window is only as good as what was recorded: an unrecorded run does not count, and the thresholds are a starting point to tighten as the window fills rather than a measurement of a history nobody kept.
- `governance.metrics.log` must exist; `doctor` fails when a declared log is missing.
- This repository declares `minFirstPassRate: 0.75`, `maxFlaky: 1`, `maxTimeouts: 0` over a 20-run window, sized so one honest red run ages out of the floor once three green runs are recorded after it.
