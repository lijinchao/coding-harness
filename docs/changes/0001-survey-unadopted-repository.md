# Survey an unadopted repository

## Context

The harness can validate and inspect a repository only after that repository has
a manifest. An existing repository therefore cannot ask the tool why it is not
ready before allowing `init` to write files. The `qihooagent` repository exposed
this gap: it has useful instructions, documents, and gate scripts, but no
manifest, CI declaration, or safe aggregate command.

## Plan

1. Add a read-only `harness survey --dir <path>` command that works without a
   manifest.
2. Report Git identity and working-tree state, Agent entrypoints, governance
   files, candidate documents, CI files, and candidate verification commands.
3. Classify candidate commands without executing them. Wildcards, missing
   executables, and commands with external-service or high-impact signals must
   remain visible but cannot become safe defaults.
4. Distinguish `not-adopted` from `healthy`; a missing manifest must never
   produce a ready result.
5. Keep the target repository byte-for-byte unchanged and emit stable JSON that
   a later adoption workflow can consume.
6. Validate the behavior with isolated fixtures and a read-only survey of the
   real `qihooagent` checkout.

## Verification

Pending implementation.
