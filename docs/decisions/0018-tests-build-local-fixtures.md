# 0018 — Tests build local release fixtures

## Problem

The `init` tests ran the command with its default source, the GitHub URL, so every run fetched the released base tag. Before a tag was pushed the suite failed, and every release had a chicken-and-egg window where code was finished but tests were red. The suite also depended on the network in CI, where a transient `git clone` failure looks like a code failure.

## Decision

Tests build their own release fixture: `harness release --base base --out <tmp> --version <current>` and then `harness init --base-source <tmp>`. No test references the GitHub URL. For a local base source, `init` pins `tool.source` to the running tool's checkout instead of to the base registry, and the bootstrap resolves a local `tool.source` as a directory containing `bin/harness.mjs`, falling back to the legacy parent-directory form.

## Alternatives

- Keep fetching the tag and accept the pre-tag window: it hid real failures behind network errors and made the release order load-bearing.
- Mock the fetch: a mock tests the mock, not the fetch and verify path the consumer uses.
- Move `init` tests to a separate opt-in suite: the default suite is what a contributor runs, so the default suite is where the coverage belongs.

## Consequences

- The suite runs offline; `npm test` no longer depends on a pushed tag or on GitHub.
- `init` with a local base source pins `tool.source` to the tool checkout, so a local scaffold resolves the tool without a network fetch.
- The release order is no longer load-bearing for tests, only for consumers.
