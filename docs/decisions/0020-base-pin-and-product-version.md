
Status: implemented

## Problem

`governance.version` required prose files to restate the pinned base version. A version pin is a dependency, like a lockfile entry, and lockfiles do not belong in prose: the check manufactured the drift it was meant to catch, and a repository with no product version had to write the harness pin into its `VERSION` file to pass.

## Decision

The base pin lives only in `manifest.version` and the lock. A repository's product version is declared separately: `product.version.path` names the one file that holds it, with an optional `pattern` whose first capture group is the version — without a pattern the whole file must be exactly one version — and `product.mentions` lists the documents that must agree with it. `governance.version` is removed, and the validator states the replacement. `harness upgrade` still rewrites a mention that carries the previous base version, which keeps a repository whose product version tracks the base pin in sync.

## Alternatives

- Keep `governance.version` and deprecate it: two mechanisms for one fact through a migration window, when both consumers are in this workspace.
- Derive the version from git tags only: tags are the release source, but the harness cannot require one product-version scheme; the declared file is the interface.
- Keep requiring prose to name the base pin: it duplicates the manifest in human text and fails whenever either side is edited.

## Consequences

- A repository with no product version simply omits `product`; being unversioned is a truthful state.
- A stale mention fails `doctor` against the declared source, not against whatever the pin happens to be.
- A version file that also carries prose must declare a pattern, which makes the second fact explicit.
- `harness upgrade` rewrites mentions only where the previous base version literally appears; an independent product version is untouched and checked by `doctor`.
