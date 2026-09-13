
Status: implemented

## Problem

Three checks could silently stop checking. `governance.decisions` and `governance.postmortems` only inspected records when the declared directory existed, so deleting or renaming the directory disabled the check while the manifest still claimed it. `surfaces` was validated from the gate side only, so a tracked file that no surface covered selected no gate. And a rule such as "do not restate the base pin in prose" had no check at all.

## Decision

A declared governance directory that does not exist is a problem, matching `governance.changes`. When `surfaces` is declared, every file `git ls-files` reports must match some surface; a repository may declare a catch-all surface. `governance.docs` entries accept `forbid` patterns with an optional `allow` list, and `harness select` reports a changed path that no surface covers. The dead `governance.version` branch left in `doctor` by the version split is removed.

## Alternatives

- Treat a missing directory as "nothing to check yet": it makes deleting a directory an undetectable way to disable a check.
- Warn instead of fail on an uncovered path: the minimal-check path would still under-test silently, and CI hides that, which is where it is least visible.
- Hardcode a check for stale harness-version text: the rule is "do not restate the pin", not "restate it correctly", and a generic `forbid` list expresses it without naming one tool.

## Consequences

- Deleting a declared directory, or adding a tracked file no surface owns, fails `doctor`.
- A repository that wants a total matrix writes it; a repository that wants a catch-all writes one explicitly.
- The base's own repository declares seven surfaces covering every tracked file, including `dist/` and the example fixture.
