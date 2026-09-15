# System manifest

`system.manifest.json` describes one reviewed combination of repositories. It
does not replace each repository's `harness.manifest.json`.

```json
{
  "schema_version": "coding-harness.system/v1",
  "id": "example-system",
  "repositories": [
    {
      "id": "control",
      "role": "governance and contracts",
      "path": ".",
      "revision": "0123456789abcdef0123456789abcdef01234567"
    },
    {
      "id": "runtime",
      "role": "runtime implementation",
      "path": "../runtime",
      "revision": "89abcdef0123456789abcdef0123456789abcdef"
    }
  ],
  "contracts": [
    {
      "id": "runtime-api",
      "producer": "runtime",
      "consumers": ["control"],
      "evidence": {
        "repository": "control",
        "path": "docs/contracts/runtime-api.md"
      }
    }
  ],
  "verifications": [
    {
      "id": "runtime-unit",
      "repository": "runtime",
      "tier": "unit",
      "command": "npm test",
      "external": false,
      "reviewed_by": "@owner"
    }
  ]
}
```

Run `harness system-check --manifest system.manifest.json`. The command emits
JSON and exits non-zero for an invalid declaration, missing or non-Git
repository, revision mismatch, dirty checkout, or missing contract evidence.
An unresolved verification executable also fails the check. It never runs
`verifications`.

Use `revision: null` for a known system member whose checkout or accepted
revision is unresolved. This keeps the topology explicit while forcing
`ready: false`; never substitute an old or guessed commit.

The tiers are `harness-check`, `unit`, `contract`, `integration`, and
`external-qualified`. Every repository needs a reviewed verification.
Wildcards and multiline commands are rejected. A command with an obvious
network or provider signal must use `external-qualified` with `external: true`;
other tiers cannot opt into external execution.

Survey candidates remain suggestions. A person reviews the exact command and
adds it with `reviewed_by`; there is no automatic promotion. `declared-ready`
means only that the pinned checkout combination and contract evidence align.
It is not test success, integration qualification, release, or runtime proof.
