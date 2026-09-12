# 0008 — A green gate must also have clean output

Status: accepted
Date: 2026-09-12

## Problem

A consumer's CI was green while its engine printed `SCRIPT ERROR:` and `ERROR:` lines: the gate
runner trusted the process exit code, and the engine exits zero despite those errors. A pin and a
set of gates did not prove the run was clean. The launcher also read the manifest from the current
directory, so invoking it by absolute path from outside the repository used the wrong pin.

## Decision

- A gate may declare `expect: { forbid: [...], allow: [...] }`. A gate passes only when its command
  exits zero, does not time out, and no output line matches a forbidden pattern unless the same line
  matches an allow entry.
- A base release may set `requireOutputAssertions: true`; `doctor` and `check` then reject a
  blocking gate that declares no `expect.forbid`.
- The bootstrap resolves `harness.manifest.json` and the tool cache next to the script and runs the
  tool from that directory, so an absolute-path invocation behaves like one from the root.

## Alternatives

- **Treat any `ERROR` output as failure centrally.** Rejected: projects need a per-gate allow list
  for benign lines, and the tool must not encode any project's log format.
- **Trust exit codes and document the caveat.** Rejected: the false green is exactly the failure to
  remove.

## Consequences

- Blocking gates must state what a clean run looks like, not only that it exited zero.
- An engine's `SCRIPT ERROR:` / `ERROR:` lines fail the gate unless explicitly allow-listed.
