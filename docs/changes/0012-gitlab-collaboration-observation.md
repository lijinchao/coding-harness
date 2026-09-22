# 0012 — Observe GitLab collaboration against a pinned system snapshot

## Context

The system snapshot binds Change ID, repository revisions, and local test
receipts, but it cannot identify the MR, reviewers, or CI run for those
revisions. A `reviewed_by` string is not authenticated approval, and GitLab's
top-level `approved` flag can be true with no applicable rule.

## Plan

1. Add an opt-in, read-only `system-gitlab-observe` command with an explicit
   HTTPS host, a target file mapping changed system members to numeric GitLab
   project/MR IDs and exact required Job names, an env-only token name, and a
   new report path outside member repositories. No GitLab writes or pipeline
   triggers. Reject duplicate/unknown/missing changed members before egress.
2. Require a ready pinned snapshot, then GET each MR, its `approval_state`,
   the selected head Pipeline, and current non-retried Jobs. Bind MR source
   SHA to the pinned repository revision; require an open MR, at least one
   applicable positive approval rule and every such rule satisfied, a
   successful detached MR pipeline on the same SHA, and exactly one successful
   non-allow-failure current Job per declared name. Re-read MR and approval
   state to detect in-flight drift. Unsupported merge-result/Train pipelines
   fail closed in this first version.
3. Emit a bounded, redacted observation with manifest and target digests,
   system/Change IDs, project/MR/Pipeline/Job identities, problems, and clear
   `remote_reads` vs `commands_executed` fields. Never store tokens, MR bodies,
   full API responses, or Job logs. An observation is evidence from the
   configured API transport, not a signed attestation or merge authorization.
4. Test through an injected fake transport: good path, stale SHA, empty or
   unmet rules, wrong pipeline or Job, pagination, changed MR on re-read,
   invalid target/host, non-2xx and malformed responses, and output safety.
   Run full tests, doctor and the pinned example check.

## Verification

- `node --test test/system-gitlab.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`

This slice does not modify CI templates or `system-ci` health. Live GitLab
permissions, self-managed API compatibility, and artifact provenance remain
explicitly unverified until a scoped deployment exercises them.
