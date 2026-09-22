# System manifest

`system.manifest.json` describes one reviewed combination of repositories. It
does not replace each repository's `harness.manifest.json`.

For a cross-repository change, the optional `change` field binds one shared
ID to repository-owned records at pinned commits. See
[system-change.md](system-change.md) for the format and evidence boundary.
Optional per-member baselines add actual-diff coverage before review.

When the governance repository is itself a system member, a committed manifest
cannot pin its own containing commit. Keep a reviewed declaration in that
repository with `revision: null` for the governance member. After committing
it, explicitly bind the full revision of every null member into a separate
snapshot outside all declared repositories:

```sh
harness system-snapshot --manifest control/system.manifest.json \
  --bind control=<full-commit-sha> --out snapshots/system-pinned.json
harness system-check --manifest snapshots/system-pinned.json
```

The snapshot builder refuses unknown, duplicate, missing, or overriding
bindings; it verifies every repository is clean and at the exact revision,
rebases repository paths to the snapshot location, and refuses in-repository
output or overwrite. It runs no declared command. Put the snapshot in a
reviewed CI artifact or a stable system bundle whose relative repository layout
is retained. An explicit revision argument is not Owner approval: the
declaration's commands and relationships still need review, and the resulting
`declared-ready` status remains weaker than a passing tier receipt.

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
    "required_tiers": ["unit"],
    "max_receipt_age_seconds": 86400,
    "promotion": {
      "history_window": 20,
      "minimum_runs": 10,
      "minimum_healthy_rate": 0.95,
      "minimum_consecutive_healthy_runs": 5
    }
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

Before approval, `harness command-review` can create an independent
exact-revision execution receipt. That receipt always carries
`authorizes_verification: false`; passing it never fills or substitutes for
`reviewed_by`. See [command-review.md](command-review.md).

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

`max_receipt_age_seconds` is a hard freshness budget in `system-ci`: an older
receipt or one timestamped in the future is unhealthy. The independent
`system-receipt-check` remains an immutable binding check and does not apply a
wall-clock policy.

To measure Shadow stability, retain earlier `system-ci` JSON reports in a
separate artifact directory and pass it read-only:

```sh
harness system-ci --manifest system.manifest.json --receipts ci-receipts \
  --history previous-shadow-reports > current-shadow-report.json
```

The current observation joins valid earlier reports for the same system. The
bounded window reports sample size, healthy count and rate, current healthy
streak, ignored files, and `promotion_eligible`. Store the current report only
after the command finishes so it becomes input to a later run.

After a team has reviewed stable Shadow results, it may explicitly add
`--enforce`; the same unhealthy report then exits non-zero. Enforcing is a CI
policy change, not an automatic Harness transition. `promotion_eligible` is
advisory and never turns enforcement on or changes the current enforce result.
A missing or malformed manifest is also contained in Shadow and becomes
blocking only under enforce.

## CI scaffolds and artifact layout

Print a reviewable provider scaffold, or explicitly write one into an existing
parent directory:

```sh
harness system-ci-template --provider github
harness system-ci-template --provider gitlab --out system-ci-shadow.yml
```

Both use `.harness/system-ci/receipts`, `.harness/system-ci/history`, and
`.harness/system-ci/current/system-ci.json`. They never include `--enforce` and
refuse to replace `--out` unless `--force` is explicit. The provider must still
restore prior reports and checkout every repository at the paths declared by
the system manifest; comments in the scaffold mark those integration points.
The current report and receipts are archived with an always-run artifact step.
