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

The JSON has no observation timestamp. Repeating survey against the same Git
and filesystem state therefore produces a stable report suitable for review
and comparison.
