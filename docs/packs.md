# Packs

A pack is depth that does not become everyone's burden: a released, hashed, pinned artifact shaped like the base, contributing gates, surfaces, and skills for one kind of repository. The contract is [0036](decisions/0036-a-pack-is-a-pinned-release.md); this page is how to use it.

## Declaring one

```json
"packs": [
  { "id": "node-typescript-monorepo", "source": "git:https://github.com/example/packs.git", "version": "1.2.0" }
]
```

`source` and `registry` mean what they mean for `base`: a directory holding `<id>@<version>/` releases, or a `git:` URL fetched at `v<version>`. A pack is released with `harness release --base <pack dir> --out <registry> --version <v>`, so it is verified by the same per-file hashes as the base and never introduces a second mechanism.

## Contributing

The pack's `pack.json` declares what it contributes:

| Field | Meaning |
|---|---|
| `id` | The pack id; every contributed id is `id/name` |
| `kernelVersion` | The minimum kernel (`>=` the base version the repository pins) |
| `gates`, `surfaces`, `skills` | The declarations, with namespaced ids |
| `packs`, `conflicts` | Pack ids this one requires or refuses |

Resolution is atomic: every declared pack is fetched, verified, and merged before any command reads the manifest, and a failure — an unnamespaced id, a kernel that is too old, a missing dependency, a conflict, a collision with a repository gate — leaves the manifest untouched.

The merge order is kernel defaults, then packs in declaration order, then the repository. A repository gate colliding with a pack gate is an error unless that gate declares `override: true`, and `lock.overrides` records what was overridden. `lock.packs` records each pack's version and per-file hashes, so a generated gate is traceable to the pack that produced it. Pack contributions live in memory and in the lock; they are never written into the repository's own manifest.

## The shipped packs

`packs/node-library/` contributes three gates (no committed `node_modules`, a license file, no `console.log` in `src/`). `packs/architecture/` contributes two that hold for any repository (generated code stays out of `src/`, one package system at the root). Every gate is shell-only: a pack's failure injection runs in someone else's repository and must not assume a toolchain it may not have.

`test/pack-conformance.test.mjs` is the conformance a pack owes its consumers: one fixture consumer declares both, and every contributed gate is watched to fail and pass again.

## Seeing what a pack contributes

`harness packs --manifest <path>` lists each declared pack with its version and locked file count, then every gate (with the command it runs), surface (with its paths), and skill it contributes, and every gate the repository overrode. Adoption is then a decision made by reading, not by trusting.

## Not yet

`harness diff --pack <id>@<version>` reports what a pack upgrade adds, changes, or removes — each gate with its command, each surface with its paths, each skill with its file. What is still missing is the automatic call: `upgrade` does not print that report when a declared pack version changes, and pack *versions* are still moved by editing the declaration.
