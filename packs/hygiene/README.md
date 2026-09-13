# hygiene

Two repository-hygiene gates: no unresolved merge markers anywhere in the tree, and no tracked file over 1 MiB.

The size limit is declared here rather than hidden in a command, so a repository that needs a larger fixture knows what it is overriding. Both gates are shell-only and covered by `test/pack-conformance.test.mjs`.
