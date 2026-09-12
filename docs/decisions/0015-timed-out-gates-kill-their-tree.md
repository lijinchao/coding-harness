# 0015 — A timed-out gate kills its process tree

Status: implemented

## Problem

A gate runs its command under a shell. On timeout the runner sent `SIGTERM` to the shell only, so a gate that had spawned children — an engine run, a test server, a pipeline — could leave them running past the timeout and past the CI job. The result reported only an exit code and a timeout flag, so a gate killed by a signal could look like a clean run.

## Decision

Each gate runs `detached` in its own process group on POSIX. A timeout signals the group with `SIGTERM`, then `SIGKILL` after a five-second grace period. `SIGINT` and `SIGTERM` received by the runner are forwarded to the running groups before the runner re-raises the signal, and `process.on('exit')` is a final `SIGKILL` sweep. A result reports `code`, `signal`, `timedOut`, and `ms` separately, `harness gates` prints the signal beside the timeout, and `--report` records `timedOut` and `ms` per gate.

## Alternatives

- A per-gate cleanup command in the manifest: it must be written and proven for every gate, and it cannot run when the gate has been killed.
- Rely on CI to reap the job's processes: the leak happens locally too, and a reaped process is not a passing gate.
- Skip the grace period and send `SIGKILL` immediately: a gate that handles `SIGTERM` and writes a last diagnostic would be silenced.

## Consequences

- A timed-out gate no longer leaves orphans, and its result is never counted as clean.
- `detached` plus group kills means the runner, not the terminal's process group, owns gate teardown; signal forwarding preserves Ctrl-C behavior.
- `metrics` now has `ms` and `timedOut` per gate to build on; duration and flake statistics are still missing.
