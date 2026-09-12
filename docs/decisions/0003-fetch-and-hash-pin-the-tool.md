# 0003 — Fetch and hash-pin the tool

Status: implemented
Date: 2026-09-12

## Problem

The tool was consumed from a checkout: the consumer's CI checked out this repository
as a sibling and ran its `bin/`, and its local entry reached for
`../coding-harness/bin/harness.mjs`. The base was pinned by version and hash, but the
program that verified it was not pinned at all — any commit on the default branch could
change what `check` meant.

## Decision

- A consumer runs a small, committed bootstrap (`harness`) that reads `tool.version`,
  fetches the tool at tag `v<version>` into `.harness/tool/`, and execs it.
- `lock.tool.files` records a SHA-256 per tool source file; `sync` and `check` fail when
  the running tool no longer matches.
- CI needs no checkout of this repository; it runs `./harness check`.

## Alternatives

- **Publish the tool as an npm package.** Rejected for now: it adds a registry and a package
  manager to a project that keeps zero runtime dependencies.
- **Vendor the tool into every consumer.** Rejected: it copies the tool N times and drifts,
  the same failure as a copied base.
- **Keep the sibling checkout and pin only the version.** Rejected: it leaves the verification
  program unpinned by content and still couples the consumer to a checkout path.

## Consequences

- The consumer's gate command becomes `./harness check --manifest harness.manifest.json`.
- The example and the Godot consumer carry the bootstrap; `.harness/` is ignored.
- `tool.source` defaults to `base.source`; a tool released elsewhere can set its own.
