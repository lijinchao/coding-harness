
Status: implemented

## Problem

Three artifact types answered the same question. A plan, a change record, and a decision record each restated the problem and the approach, so they drifted: the plan carried implementation results after it was done, and the change record duplicated the decision. The base's own rule — one fact, one home — was violated by the base's own artifacts.

## Decision

A decision record is the durable record and carries the lifecycle: `proposed`, `accepted`, `implemented`, `superseded`, or `rejected`, with `Superseded-by:` naming a record that must exist. An in-repository plan is a `proposed` decision, not a separate type; the base adds no `plans` artifact. A change record carries only the evidence git cannot: `## Verification` is required, `## Context` is optional, and an optional `Decision: <path>` line must resolve to a record. What changed lives in git.

## Alternatives

- Keep `plans/` as its own type: it duplicates the decision's problem and approach and has no lifecycle, so it never closes.
- Force every change to name a decision: routine changes do not make decisions, and a mandatory link would be filled with a placeholder.
- Keep the change record's `## Problem` and `## Approach`: they restate the decision and the pull request, which is where those facts already live.

## Consequences

- The plan-before-implementation rule is satisfied by committing a `proposed` decision record, and the same file becomes `implemented` rather than spawning a second artifact.
- A change record without a decision link is valid; it is the evidence record, not the rationale record.
- The base's own record set is now lifecycle-checked: every shipped decision is marked `implemented`.
