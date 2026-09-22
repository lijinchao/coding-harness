# Read-only GitLab collaboration observation

`system-gitlab-observe` is an opt-in observation for a ready, pinned system
snapshot with a Change ID and one explicit baseline per repository. It does
not create or update GitLab objects, execute repository commands, grant merge
approval, or change `system-ci` health.

Create a targets file outside the member repositories or commit a reviewed
copy. Every changed member from `change.bases` needs one target; unchanged
members have none:

```json
{
  "schema_version": "coding-harness.gitlab-targets/v1",
  "merge_requests": [
    {
      "repository": "runtime",
      "project_id": 123,
      "project_path": "team/runtime",
      "iid": 42,
      "target_branch": "main",
      "required_jobs": ["unit", "contract"],
      "policy": { "approval": "all-positive", "pipeline": "detached-mr" }
    }
  ]
}
```

With an existing token in an environment variable, invoke:

```sh
./harness system-gitlab-observe --manifest /outside/system-pinned.json \
  --targets /outside/gitlab-targets.json --host ai.code.geelib.qihoo.net \
  --token-env GITLAB_TOKEN --out /outside/gitlab-observation.json
```

The CLI only issues bounded HTTPS `GET` requests to the explicit host, refuses
redirects, and never prints the token. It checks the local Git remote and
GitLab project identity before reading the MR. The MR must be open, in the
same project (fork MRs are not supported), target the declared branch, and
have a source SHA equal to the pinned repository revision. The report's
`observed` field means the API identities were read consistently; `ok` means
the declared policy also passed. The default policy is `all-positive` approval
and `detached-mr` Pipeline: positive rules must be satisfied by distinct
non-author approvers, with no overwritten rules, and the successful MR
Pipeline must have source `merge_request_event`. A target may explicitly use
`approval: observe-only` or `pipeline: mr-head-success` when those rules do
not fit its workflow. The chosen policy is recorded in the result. Every
declared required Job must still succeed, belong to the Pipeline, and not
allow failure or be a retried instance. MR and approval state are read again
before reporting. Pagination is bounded.

The JSON observation binds the portable manifest and targets SHA-256 digests,
system/Change IDs, and project/MR/Pipeline/Job identities. It excludes MR
bodies, raw responses, Job logs and credentials. Existing output files are
never overwritten; output must remain outside every declared repository.
Failed remote checks still produce a failed report when the declaration and
output location were valid. Configuration and snapshot errors stop before
network access.

This first version does not support merged-result pipelines, Merge Trains,
fork MRs, child Pipeline validation, or reusable CI artifact provenance. A
local report is not a signed attestation; it must not be used as a merge gate
until a trusted CI integration binds the report to its runner and current MR.
GitLab edition, API permissions and project approval rules need validation
on the target instance before rollout.
