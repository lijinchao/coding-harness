# Command review receipts

Survey discovers candidates but does not approve or run them. A system
manifest admits a command only after a person fills `reviewed_by`.
`command-review` supplies machine-checkable evidence between those stages.

Run one candidate against a full, exact commit:

```sh
harness command-review \
  --repository /path/to/repository \
  --revision 0123456789abcdef0123456789abcdef01234567 \
  --command "node --test test/focused.test.mjs" \
  --out /outside/the/repository/command-review.json \
  --timeout 300
```

The source checkout may be dirty because the command never runs there. The
tool verifies that the full revision exists, exports only committed files with
`git archive`, executes inside the temporary export, hashes the tree before and
after, removes the temporary directory, and then writes the receipt. Existing
output is immutable unless `--force` is explicit.

Raw stdout and stderr are shown to the caller but not retained in the receipt;
only byte counts and SHA-256 values remain. A zero exit with no isolated-tree
change is `passed`. A non-zero exit or timeout is `failed`. Any added, modified,
or removed path makes the receipt `mutated`, including a successful command.

Check the binding later without running the command:

```sh
harness command-review-check \
  --repository /path/to/repository \
  --revision 0123456789abcdef0123456789abcdef01234567 \
  --command "node --test test/focused.test.mjs" \
  --receipt /outside/the/repository/command-review.json
```

The check accepts valid failed and mutated evidence; its job is integrity, not
promotion. It separately reports whether the command passed without changing
the isolated tree.

## Safety boundary

Git archive isolation protects the source checkout and excludes its uncommitted
state. It is not an operating-system sandbox. The receipt compares only paths
inside the exported tree and always declares network access, child processes,
and outside-tree writes as `not-observed`. The receipt separately records
whether `--allow-external` was present. An obvious external-service command
is refused unless the caller separately passes `--allow-external`; that flag is
authority for one invocation, not proof that every side effect is contained.

Every receipt fixes `authorizes_verification` to `false`. A repository owner
must still assess meaning, environment, side effects, and coverage before
adding the exact command and their identity to `system.manifest.json`.
