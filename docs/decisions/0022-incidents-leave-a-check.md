
Status: implemented

## Problem

The base ships a postmortem template but nothing governs postmortems. An incident could be written up, the fix merged, and the lesson survive only as prose; nothing tied the record to a check that would catch the failure again. The adapted practice is explicit: an incident becomes a record and a permanent regression test.

## Decision

A repository may declare `governance.postmortems`. Each record must carry `## Impact`, `## Root cause`, `## Response`, `## Regression test`, and `## Action items`, and must name at least one `Regression: <gate id or path>`. `harness doctor` resolves each reference against the manifest's gate ids and the working tree, so an incident that leaves no check is not closed.

## Alternatives

- Require the regression to be a gate: too strong; an incident can be carried by a test suite rather than a gate, and the record names any existing check.
- Track action items in the record only: a checkbox nobody verifies is how a postmortem decays; the check is the part that must exist.
- Keep the template ungoverned: that is the state this decision replaces.

## Consequences

- A postmortem that names a gate or test which was later deleted fails `doctor`, so the record cannot outlive its check silently.
- The section list is fixed, but the `Regression:` lines are what the check can verify; the rest is for people.
- The base ships one real record for the schema/validator drift, so the mechanism is exercised rather than only specified.
