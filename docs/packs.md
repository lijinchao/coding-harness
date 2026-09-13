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

## Not yet

`harness diff` and `upgrade` report file changes, not yet the gates, skills, surfaces, commands, and permissions a pack upgrade adds; and no pack has shipped, so the ecosystem is a contract with a working interface and no members. Both are the next steps.
