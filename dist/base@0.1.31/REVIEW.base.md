# Review passes

Run these passes on every pull request, and tag each finding with its pass.

- **Bugs** — logic errors, broken edge cases, regressions.
- **Security** — injection, authentication gaps, secrets in the diff.
- **Compliance** — the change matches the accepted spec and the committed plan.

## Severity

Reserve **Important** for findings that would break behavior, leak data, or breach a policy. Style and naming are nits.

## Limits

- Cap nits at five per review; summarize the rest as a count.
- Do not report generated files, or anything a gate already enforces.

## Approval

Findings do not approve a pull request. Approval comes from a code owner, informed by the findings. The agent that wrote the code never approves it.
