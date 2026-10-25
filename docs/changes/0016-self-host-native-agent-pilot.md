# Native discovery and real-task feedback

decision: docs/decisions/0048-self-host-native-agent-pilot.md

## Verification

Self compositions generate six native skill entries from one pinned source,
using existing sync/check hashes. The drift proof corrupts a native skill and
observes failure followed by recovery. Claude's 2.1.277+ AGENTS support is
documented with version/mode qualifications; the pilot used temporary 2.1.310
without changing the installed CLI or global settings.

Eleven bounded live runs are preserved, including provider errors and timeouts.
DSH actually invoked the native verification skill and ran repository tests.
The first native run omitted required delivery checks, so base 0.1.46 clarifies
that targeted verification does not replace mandatory checks. A rerun attempted
both, but its 8192-byte JSON result was truncated. It remained unqualified until
an independent exact-fixture full-suite/example receipt supplied complete logs.

Scorer regressions reject model assertions without commands, incomplete turns,
timeouts, edits, failed checks, truncated results and failed skill calls. Offline
summaries preserve source/trace bindings and append delivery-outcome observations
once without mixing them into the gate-health budget. Model calls never run in
npm test. Human acceptance remains pending; no general token-saving claim is made.

See [the pilot report](../native-agent-pilot.md) and its generated result JSON
for versions, conditions, blocked cases, selected commands and usage limits.
