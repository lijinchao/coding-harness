
Status: implemented

## Problem

`harness metrics` reported a first-pass rate and a failure count per gate. It could not show a gate that is slow, a gate whose dependencies keep skipping it, or a gate that both passes and fails across runs — the three signals that say where to spend the next hour.

## Decision

Gate results already carry `timedOut`, `skipped`, `reason`, and `ms`. `harness metrics` now reports run duration percentiles, per-gate failures, skips, and timeouts, flakiness (some runs pass, some fail), and the slowest gates by p95. A skipped gate is counted separately from a failure, so it no longer inflates the failure count.

## Alternatives

- Add a metrics backend: the harness is zero-dependency, and a file of JSON lines is already the interface.
- Report every gate's duration: noise; only the slowest few and the flaky ones change a decision.
- Treat a skip as a failure: it hides the difference between "the check failed" and "the check never ran", which is the distinction dependencies and fail-fast were added for.

## Consequences

- A flaky gate is visible from the report alone, so it can be fixed or made advisory instead of being retried.
- Duration percentiles need at least three samples per gate before the slowest list appears; report lines without `ms` are ignored.
- The report format is unchanged; metrics simply read more of it.
