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
