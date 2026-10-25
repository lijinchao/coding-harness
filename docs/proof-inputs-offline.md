# Proof inputs and offline dependency resolution

`proof_inputs` is a gate's explicit list of checker files relative to the
consumer repository. It is not a list of all product files being checked.

```json
{
  "governance": {"proofs": {"require": "blocking", "requireInputs": true, "maxAgeDays": 30}},
  "gates": [{"id": "architecture", "proof_inputs": ["scripts/check-domain-boundary.mjs"]}]
}
```

This fragment omits the ordinary required gate fields. Include local helpers
and rule configuration that affect the check. A declaration is not automatic
dependency discovery: an omitted helper remains unbound. Immutable tool/pack
pins still use their own existing file locks; project-owned adapters need inputs.

## Binding and migration

`prove --record` snapshots sorted path/SHA-256 pairs in `lock.proofs[id].inputs`
only after an actual failed injection and successful normal recovery. Both
`prove --check` and `gates` compare current bytes and the declared file set.
The snapshot is compared before and after the proof as well. Missing, untracked,
duplicate, noncanonical, absolute, parent-escaping, glob or symlink input paths
fail; the first version accepts regular tracked files only. Stage new files
before checking them. Do not bind the manifest containing the proof itself:
recording would invalidate its own input. Do not hash ordinary product sources
unless changing them changes the checker/rule, rather than only its subject.

With `requireInputs: true`, gates covered by the proof policy must declare
inputs; legacy records without input snapshots cannot satisfy those declarations.
Without this opt-in, existing gates retain declaration-only semantics. The
`prove --check` output separately reports how many gates declare inputs.
This is not a claim that every repository has migrated, nor that hashes prove
the rule is adequate. Keep fault injection, code review and CI re-proving.

Upgrade the pinned tool before adding new fields. Publish checker changes as
a new tool/base release; do not edit a released artifact to update a hash.
After declaration changes, commit, run isolated prove --record, run gates and
check freshness. Producers regenerate attestation when their lock changes.

## Offline mode

`./harness check --manifest harness.manifest.json --offline` and
`HARNESS_OFFLINE=1 ./harness ...` refuse dependency downloads. The bootstrap
reads the flag before launching the CLI; child commands inherit the environment.
The same policy applies to tool, base and pack acquisition. Cache misses fail
with a named dependency, not a network retry. Normal release/file/pin checks
remain enabled; corrupt cached artifacts are not silently repaired offline.

A standard manual Git worktree can borrow its own main checkout's matching
cache via git-common-dir. Tool reuse requires a declared commit and verifies
it; base/pack caches are keyed by source, version and tag, then release-verified.
Tool-created proof worktrees also retain existing ignored-state carry behavior.
No arbitrary sibling directory search, global Git configuration, credential
copying or cache deletion is performed. Nonstandard Git layouts or custom
absolute caches may need explicit prepopulation rather than fallback discovery.

Online acquisition is bounded to 30 seconds per Git clone with low-speed
limits. Offline mode controls harness dependency fetches, **not arbitrary
network calls made by repository commands**. Use an OS/container policy when
network or credential isolation is required. Fresh machines must first acquire
the pinned dependencies through an authorized online channel.
