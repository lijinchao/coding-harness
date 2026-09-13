# 0027 — The release and the example consumer are gates

Status: implemented

## Problem

Nothing checked that the committed `dist/base@<version>` matched what `base/` produces. A release was a manual step: run `release`, commit the artifact, and trust nobody edited `base/` afterwards. The failure mode appeared twice in a row — a base file changed after the artifact was written, and a version bump without a re-release — and the drift became visible only when a consumer fetched the tag and its hashes disagreed. The example consumer had the same gap in reverse: it is the canonical composition of the base, but nothing failed when it stopped composing or its lock stopped matching the pinned release.

## Decision

The repository declares two gates. `release` (phase `release`, needs `tests`) rebuilds the base into a temporary directory with `--force` and diffs it against the committed `dist/base@<version>`, so the artifact is checked instead of remembered. `example` runs `check` and `validate` against `examples/consumer/harness.manifest.json`, so a base change the example was not re-composed against fails before a consumer sees it. Both carry a `prove_fires_command` and a `revert_command`; the docs and base surfaces require `release`, and the example surface requires `example`.

## Alternatives

- Compare hashes inside the gate instead of re-releasing: that checks the same file twice rather than checking `base/` against the artifact.
- Let the gate re-release in place: a gate that writes the artifact cannot fail when the artifact is wrong; `--force` into a temporary directory keeps the check read-only.
- Leave the example to the test suite: the suite builds its own fixtures, so a fixture that never runs the real example would not have caught the example drifting.
- Give the example its own CI instead of a gate: two repositories for one contract, and the example exists to be cheap.

## Consequences

- A base edit that skips `release`, and an example that no longer composes or validates, both fail `harness gates` and CI.
- The `release` phase now has a repository-local implementation, which is the convention the base recommends.
- The check costs a full release build on every gate run; it is tagged `release`, so a local run can select the unphased gates and skip it.
- A full proof on this repository now proves a gate that runs the whole suite, so a proof takes minutes; the isolated proof mode keeps the checkout clean while it does.
