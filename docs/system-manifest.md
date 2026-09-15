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
  ],
  "qualification": {
    "required_tiers": ["unit"]
  }
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

## Tier execution receipts

Run one reviewed tier only:

```sh
harness system-run --manifest system.manifest.json --tier unit \
  --out /outside/the/repositories/unit-receipt.json --timeout 300
harness system-receipt-check --manifest system.manifest.json \
  --receipt /outside/the/repositories/unit-receipt.json
```

Execution requires a ready snapshot. Receipt output must stay outside every
declared repository so generating evidence does not dirty the snapshot being
proved. Each command runs from its repository and is bounded by the per-command
timeout. A failed command still produces a failed receipt.
An existing receipt is immutable by default; use another path or pass `--force`
only when replacement is intentional. CLI runs show command output in the
terminal, but the receipt retains hashes only.

The receipt binds the portable manifest SHA-256, system id, repository
revisions, tier, exact
commands, result and timeout state, duration, and separate stdout/stderr sizes
and hashes. It does not store command output, which may contain secrets.
`system-receipt-check` rejects changed manifests, repository drift, command-set
drift, failed results, and malformed receipts without rerunning anything.

`external-qualified` remains disabled unless the caller separately passes
`--allow-external`. That flag is execution authority for that invocation only;
it is not persisted as production approval.

## CI Shadow

`qualification.required_tiers` names the receipts CI expects. Put each receipt
in a CI artifact directory as `<tier>.receipt.json`, then run:

```sh
harness system-ci --manifest system.manifest.json --receipts ci-receipts
```

Shadow is the default. It checks snapshot readiness and every required receipt,
reports `healthy`, `would_block`, and concrete problems, but exits zero even
when evidence is missing or stale. It never invokes `system-run` or any declared
command. This makes adoption observable before it affects merges.

After a team has reviewed stable Shadow results, it may explicitly add
`--enforce`; the same unhealthy report then exits non-zero. Enforcing is a CI
policy change, not an automatic Harness transition. A missing or malformed
manifest is also contained in Shadow and becomes blocking only under enforce.
