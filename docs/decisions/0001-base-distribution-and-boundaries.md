# 0001 — Base distribution and governance boundaries

Status: implemented
Date: 2026-09-12

## Problem

The first adoption of this harness (a consumer repository) composed its `AGENTS.md` from
the base by relative path: the consumer manifest named `../coding-harness/base/...`, its CI
checked out the base repository as a sibling directory, and its local regression entry
invoked `../coding-harness/bin/harness.mjs`. This worked on one machine only.

Three failures follow:

1. **The factory became the entry.** The consumer's governance pointed at the coding-harness
   working tree, so coding-harness was an entry and a runtime dependency of another project,
   not a tool that generated a self-describing harness.
2. **No reproducibility.** The consumer read whatever the base working tree contained at
   check time. The lock hashed the composed output, not the base source, so no released base
   version was pinned.
3. **No multi-repository shape.** A path relative to one consumer's location cannot express a
   harness that governs several repositories, and each new consumer would need its own
   sibling-path arrangement.

## Decision

- **The base is a versioned, hashed release.** `harness release --base <dir> --out <dir>`
  writes `<out>/base@<version>/` containing the base files plus `release.json`, which lists
  the version and a SHA-256 per file.
- **A consumer pins a released base, not a path.** The manifest declares
  `"base": { "source": "<release registry>" }` and `"version"` is the pinned base version.
  Composition sources prefixed `base:` resolve inside the fetched `base@<version>`; sources
  without the prefix remain repository-local deltas.
- **The lock records the base pin.** `lock.base` stores the base version and per-file hashes.
  `check` fails when a fetched base file differs from the release manifest or from the lock;
  `sync` refuses to silently accept a base that differs from the pin.
- **An upgrade is explicit.** `harness upgrade --to <version>` moves the pin and re-syncs.
  Editing a released base version in place is a broken pin, not an upgrade.
- **The entry is the generated harness.** A governed repository's composed `AGENTS.md`
  (and, for a workspace, a generated workspace entry) is the entry. coding-harness is invoked
  only to generate, upgrade, and check.

## Multi-repository shape

- A single worktree with several governed units is **one manifest with several compositions**;
  it needs no separate multi-repository mechanism.
- Independent repositories each keep their own manifest and lock (their own content authority).
  A workspace layer may declare the **combination** (member versions) and **cross-repository
  requirements**; that layer never owns member content.
- A feature that must land atomically across repositories is a signal that those repositories
  are one release unit; encode it as one manifest rather than as cross-repository orchestration.
- The workspace/requirement layer is accepted in principle and deferred; this record does not
  implement it.

## Alternatives considered

- **Materialize a copy of the base into each governed repository.** Rejected: it duplicates the
  shared layer, so a base fix must be re-applied per repository and the copies drift — the
  failure this project exists to prevent. A provenance-locked snapshot avoids the worst of it,
  but it still makes "which base version is this?" a per-repository question and weakens tamper
  evidence.
- **A central workspace manifest that owns every member's composed content.** Rejected: it
  becomes a second authority for files each member's own manifest already owns, and every
  member's check would depend on fetching the centre — the original coupling at a larger scale.
- **Cross-repository atomic landing / orchestration.** Rejected as a default: it hides the fact
  that the repositories are one release unit and makes upgrades and rollbacks all-or-nothing.
- **Leaving the tool version unpinned.** Rejected: the base would be pinned while the program
  that verifies it could change underneath the consumer.

## Consequences

- The manifest schema and `src/manifest.mjs` gain the `base` object and a `lock.base` record;
  `harness validate` enforces both.
- `harness release` becomes part of the base-owner workflow; the example consumer is re-recorded
  from `dist/` rather than from a relative base path.
- The lock records the base version, a per-file hash map, and the tool version; `sync` and `check`
  reject a running tool that differs from `tool.version`. Fetching the tool itself is still a
  checkout, not a release.
- A base source may be a local registry or a git URL (`git:<url>`); for a git source, `sync` and
  `check` fetch the tag `v<version>` into the consumer's `.harness/` cache and verify it.
