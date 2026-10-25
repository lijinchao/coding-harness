# Repository survey

`harness survey --dir <path>` observes a Git repository before adoption. It
reports the revision, working tree and worktrees, Agent entrypoints, context
files, CI and CODEOWNERS files, candidate commands, and absolute references to
other repositories.

Existing references are collapsed to their Git root, with missing children
attached to that repository. Missing standalone files are ignored because they
are evidence paths, not repository relationships.

Survey is read-only. It does not run a discovered command or write a manifest.
Every candidate command requires review, including familiar names such as
`test`; scripts may call external services despite a harmless name. Wildcards,
missing executables, external-service signals, and high-impact signals remain
visible in the report.

A repository without `harness.manifest.json` has integration status
`not-adopted`, readiness `false`, and unavailable qualification. Finding no
manifest is never a healthy result. An adopted repository remains
`adopted-unchecked` because survey does not replace `check`, `doctor`, or
`gates`.

A tracked `.coding-harness/project.json` belongs to the AI Native Harness Kit,
not to this tool. Survey reports `foreign-integration-detected`, its tracked
markers, declared version, expected `coding-harness` executable, and whether
that executable resolves. It never runs that executable or treats the foreign
manifest as compatible. Restore the matching KIT runtime or review migration;
current-project consumers use their pinned repository-local `./harness`.

The JSON has no observation timestamp. Repeating survey against the same Git
and filesystem state therefore produces a stable report suitable for review
and comparison.

After review, durable repository relationships and approved verification
commands belong in a [system manifest](system-manifest.md), never back in the
survey output.
