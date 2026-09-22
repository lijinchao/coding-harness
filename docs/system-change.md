# Cross-repository Change ID

The optional `change` field names one shared ID and points to each
participating repository's own record:

```json
"change": {
  "id": "CHG-42",
  "records": [
    { "repository": "control", "path": "docs/changes/CHG-42.md" },
    { "repository": "runtime", "path": "docs/changes/CHG-42.md" }
  ]
}
```

Each referenced regular file must be tracked at that repository's pinned Git
commit and contain an exact `Change-ID: CHG-42` line. Paths are relative to
their owning repositories. Duplicate or unknown members, escaping paths,
untracked or ignored files, symlinks, and mismatched IDs fail readiness. The
global manifest stores references, not copies of local decisions. New tier
receipts bind the ID; receipt checks reject an absent or changed ID for a
change-bound snapshot. Older manifests and receipts without `change` remain
valid. This verifies identity and revision consistency only: it does not
authenticate authors, approve a change, or prove business correctness.

## Baseline diff coverage

Optionally add one `bases` entry per declared repository to make the Change ID
cover actual committed diffs:

```json
"bases": [
  { "repository": "control", "revision": "0123456789abcdef0123456789abcdef01234567" },
  { "repository": "runtime", "revision": "89abcdef0123456789abcdef0123456789abcdef" }
]
```

Each base is an explicit full commit and must be an ancestor of that member's
pinned revision. `system-check` reports the changed paths from Git; it does not
execute repository code. Every changed member must have a repository-owned
Change ID record, and that record path must itself change between base and
pinned revision. An unchanged member must not claim a record for this change.
Missing history, incomplete member coverage, stale records, and unrelated
baselines fail readiness and appear in `system-ci` problems. The check does not
decide whether the diff is correct, whether other repositories should have
changed, or who approved it. Without `bases`, older Change ID snapshots retain
the prior identity-only check and do not claim diff coverage.
