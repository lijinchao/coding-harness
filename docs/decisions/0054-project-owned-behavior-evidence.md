# 0054 — Bind project-owned behavior and distinguish missing verification

Status: implemented
Date: 2026-10-27

## Problem

The owner asked whether the WisHarness adoption SPEC should become executable.
In the actual self consumer at 738f555, removing the tracked design from scope
still yields v1 planned with no problems. Existing v1 evidence tests also verify
a design outside scope. A legacy reasoned waiver has no structured distinction
between non-applicability and an unexecuted boundary. These are reproducible
contract limits, not evidence of a production incident or automatic semantic review.
The SDK checkout referenced by the original plan is unavailable on this host;
its templates and actual adoption cannot be independently qualified here.

## Decision

Land the narrow, opt-in behavior/evidence contract in delivery-flow, not Kernel.
Publish a new immutable in-repository pack 0.2.2 supporting delivery/v2 and the
unchanged legacy v1 path. Preserve every old release. Keep tool/base 0.1.49,
zero dependencies, ten gates, existing receipts and project-owned documents.

### Contract choices

- `design` remains the single project-owned behavior file. v2 requires both it
  and the plan itself to be canonical tracked regular files within scope.
- Scenarios use explicit `<!-- scenario: ID -->` markers in that existing file,
  outside code fences. Criterion `scenario` references must exist and be unique
  in the source. Do not copy scenario bodies or prescribe a filename/directory.
- Verification binds candidate plan bytes and behavior bytes to the same full
  revision, records SHA-256 and rejects working-tree drift. Existing scope,
  frozen-test, red/green receipt and expected-diagnostic checks remain.
- v2 replaces tier_waivers with three explicit `tiers` records: unit,
  integration, e2e; status is covered, not_applicable, not_evaluated or blocked.
  All require reasons. Missing evaluation/blocked entries also require follow_up.
  Covered declarations need named checks at that tier; only valid receipts make
  them covered evidence. Planned reports distinguish declared status from actual
  not_evaluated evidence. Unresolved tiers block full verified/accepted reports.
  Not-applicable with checks is contradictory and rejected; applicability itself
  is a human judgment, not a reason-text classifier.
- No silent migration: old v1 waivers keep legacy semantics, and v2 rejects them.
  Migration is explicit and documented, not a converter inventing missing facts.

### Execution plan and acceptance

1. Commit this plan before implementation. Add failing v2 contract and real
   CLI/receipt tests, retain legacy tests, and commit frozen tests for this task.
2. Implement schema/checker changes in pack source, not dist. Cover missing,
   untracked, out-of-scope, symlink/escaping paths, missing/duplicate scenario
   refs, all tier states, source/plan drift and incomplete migration.
3. Generate the hashed 0.2.2 release using the pinned release command. Explicitly
   move self's pack pin, adapter and proof inputs, then sync. Keep v1 example/tool
   pins unchanged. Reuse the original adoption SPEC as design, with stable markers.
4. Run actual self tasks across checker/schema/adapter boundaries. Capture exact
   red/green evidence with the existing runner, and inspect the v2 report's source
   binding and tiers. Synthetic fixtures qualify contracts only, not SDK behavior.
5. Refresh affected gate proofs and derived self attestation, run mandatory full
   tests/example/gates, strict doctor and freshness. Review independently of the
   implementation pass, push a PR, require hosted CI success, then merge under
   the owner's explicit authorization and fast-forward local main safely.

## Alternatives

- Require more Kernel fields or template documents for all tasks: adds default
  burden and duplicates project facts. Simple changes keep the v1/native path.
- Change v1 interpretation in place: breaks consumer expectations and rewrites
  the evidence meaning of old waivers.
- Bind only plan JSON: leaves the behavior source outside evidence identity.
- Classify reason text or claim semantic coverage: unreliable; machines check
  references and consistency, humans decide completeness and acceptance.
- Build another executor, Issue workflow or approval agent: existing receipts
  already supply the execution seam and confer no merge authority.

## Consequences

More metadata is opt-in and serves a specific failure; no new gate or mandatory
cross-project adoption. New self instructions/labels must not imply deployed SDK
qualification, automatic human acceptance, environment readiness or a sandbox.
No SDK/WisHarness source edits, model/production calls or new credentials.
Local artifacts and hosted CI have separate provenance. Public pack tags are not
part of this change; the committed hashed local registry is the demonstrated source.

## References

[OpenAI harness engineering](https://openai.com/index/harness-engineering/)
supports repository-local truth, progressive disclosure and mechanical boundaries;
it does not specify our JSON fields. [Anthropic long-running harnesses](https://www.anthropic.com/research/effective-harnesses-for-long-running-agents)
supports incremental work and observed completion rather than self-report. These
are design inputs, not proof that this implementation improves productivity.
The [March 2026 Anthropic follow-up](https://www.anthropic.com/research/harness-design-long-running-apps)
also recommends revisiting scaffolding as models improve and testing realistic
outcomes. Its multi-agent architecture is not adopted here: the demonstrated
gap is evidence identity/status, not a missing execution or planning agent.
The project-specific behavior remains the [adoption SPEC](../changes/wisharness-spec-adoption/spec.md).

Integration departure: changing the source VERSION after locking a generated
0.2.0 draft made sync reject its changed hashes. Do not clear/rewrite the lock
to evade that check. Discard only the never-committed draft and generate 0.2.1
with consistent source metadata. The frozen adoption test identifies the 0.2
contract line, not one patch number; this remains red on the v1 baseline.

Pre-publication review then reproduced inherited-property acceptance in the
mini-validator. Freeze a separate failing regression at 4d818ab, reject such
unknown keys in v2 only, and publish 0.2.2 without modifying committed 0.2.1.
The existing receipt API supports a different red ancestor per check; capture
this boundary from 4d818ab and the original contract checks from 7aa8715.
Do not force one synthetic baseline or mutate frozen tests to fit the capture helper.
