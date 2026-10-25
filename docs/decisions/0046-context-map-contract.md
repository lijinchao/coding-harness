# 0046 — Optional context maps with bounded entrypoints

Status: accepted

## Problem

game-design already has a useful native knowledge map, but the tool cannot
declare its authority or reading scope. Whitespace word counts undercount
Chinese content. Git's quoted path output also breaks surface coverage.

## Decision

First write failing regressions for Unicode, spaces and newlines in Git paths,
then for multilingual document byte budgets and an optional governance.context
contract. Keep maxWords backward compatible; add positive maxBytes (UTF-8,
not tokens). Context declares entrypoint and sources with id, path, scope,
when and optional unique authority. All paths stay within the repository;
sources are files, scopes are repository globs matching tracked files. The
entrypoint must have a maxBytes document budget and link to every declared
source directly or through declared sources. Doctor checks structural facts,
not semantic truth or whether an agent actually read anything.

Fix both tracked and changed Git path enumeration with NUL delimiters. Reuse
doctor and existing proof machinery; add no new gate or runtime dependency.
Create a short native map for this repository, retain game-design's existing
AGENTS/index, and pilot declarations in both. Release locally as 0.1.44, update
self/example/consumer pins, rerun proofs and attest locally; do not push tags.
No automatic task recommender or bulk context loading in this iteration.

## Alternatives

- Generate a comprehensive manual: consumes context and duplicates product facts.
- Require a new Pack: basic optional declarations belong to the kernel; templates
  can later be delivered by Packs without forcing document layouts.
- Estimate exact tokens without a tokenizer: misleading across models/languages.

## Consequences

Each project owns its paths, authorities and reading conditions. Byte budgets
bound content size, not model costs. Unique authorities avoid conflicting
declarations but do not establish correctness. Regressions must cover missing
files, escaped/symlinked paths, invalid scopes, duplicate ids/authorities,
unreachable sources, and required-field/schema agreement. Pilot findings remain
honest about missing task-level token/usefulness measurements.
