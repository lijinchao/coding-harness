# 0004 — Harden the trust, proof, and release chain

Status: accepted
Date: 2026-09-12

## Problem

A review of the tool found four gaps where the harness claimed more than it enforced:

- The bootstrap cloned the tool from a git tag and ran it before any check, so a moved tag or
  tampered repository executed first. "Pinned by content" was stronger than the guarantee.
- `harness prove` printed `skip` and exited zero for a blocking gate with no executable proof,
  and an unknown `--gate` id exited zero. Its default revert was `git checkout -- .`, which
  discards unrelated uncommitted work.
- `harness release` deleted and rebuilt an existing `base@<version>`, so a released version was
  not immutable on the producer side either.
- `harness validate` did not enforce the schema it points at: unknown fields and duplicate ids
  passed, and `check` and `scan` disagreed on lock semantics.

This project's own maintainer had also rewritten released tags to hide accidental commits, which is
the same class of failure.

## Decision

- The tool is pinned by version, commit, and per-file hashes. The bootstrap verifies the fetched
  commit before running any Node code; `sync` records `lock.tool.commit`.
- A blocking gate must declare `prove_fires_command` and `revert_command`. `validate` rejects it
  otherwise; `prove` fails on an unknown gate id, never uses a default revert, and `--record`
  stores the last proof.
- `release` refuses to overwrite an existing `base@<version>` unless `--force`. `sync` and
  `upgrade` resolve, verify, and compose before writing; each file is written to a temp path and
  renamed, and the manifest is written last.
- `validateManifest` implements the schema: unknown fields and duplicate ids are errors.
  `check` and `scan` share one `inspect` function.

## Alternatives

- **Sign releases instead of pinning commits.** Deferred: signing needs key distribution and a
  verifier; a commit pin is the smallest change that removes the trust-after-execution hole.
- **Keep skip as a soft result.** Rejected: it let "all gates proven" be asserted while nothing
  was proven.
- **Keep the destructive default revert.** Rejected: proving a gate must not discard a developer's
  uncommitted work.
- **Validate with a full JSON Schema library.** Rejected: it breaks the zero-dependency constraint;
  the hand-written validator now covers unknown fields, types, required fields, and duplicate ids.

## Consequences

- Consumers must add `prove_fires_command` and `revert_command` to every blocking gate.
- The bootstrap gains the trust guarantee only when `tool.commit` is pinned; it is optional but set
  for this repository and its consumer.
- A release can no longer be rebuilt at the same version; bump `base/VERSION`.
