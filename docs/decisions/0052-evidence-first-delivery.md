# 0052 — Evidence-first delivery with bounded governance cost

Status: accepted
Date: 2026-10-27

## Problem

agentic-ops demonstrates useful drift and contract checks, but green gates do
not establish sound measurement or product acceptance. Its 104 document budget
entries and explicit proof-input maintenance expose adoption cost. Gate-health
history does not measure that cost or delivery benefit. Current guidance also
retains superseded proof and release descriptions. The owner accepted a phased
SPEC after reviewing the consumer feedback; acceptance is not implementation.

## Decision

Optimize the portable control plane for trustworthy, human-verifiable delivery
at bounded cost, reusing existing plans, tests, reports and PRs. Distinguish
checks passed, evidence adequacy reviewed, and product accepted. None implies
the next. Keep Kernel and product facts separate.

### Scope and sequence

1. **This change:** correct current knowledge in producer and consumer; publish
   a concrete burden-reduction proposal. Keep release 0.1.49, all gates, budget
   settings, proof policy and product code unchanged. Commit this plan first.
2. **After owner approval of that proposal:** apply the smallest adoption
   adjustments, separating focused development feedback from delivery checks.
   Reuse existing artifacts; do not install a delivery pack merely to qualify.
3. **On existing authorized delivery work:** observe criterion,
   check, evidence, uncovered risk and human decision, plus governance work,
   elapsed checks and rework. Missing measurements remain unknown. This small
   observation is descriptive evidence, not a causal productivity estimate;
   no minimum task quota or new ledger is required.
4. Consider automation only for repeated, reproducible failures with acceptable
   false positives. No new Kernel feature or pack is justified by this SPEC alone.

### Decision-bearing evidence

For claims supporting adoption or product-effect decisions, reuse the report
outlet to identify code/data/configuration, model/environment when relevant,
included/excluded samples and reasons, provenance and key strata, comparison
and denominators or paired wins/losses, limitations, and review state. Start
with review/Shadow, not blocking automation. Do not scan every document number,
impose a universal sample floor, or equate provenance with experimental validity.

### Acceptance

- Current entrypoints route to correct proof/release semantics; historical
  observations retain their version and do not masquerade as current guidance.
- The reduction proposal names affected settings, retained protections, risks,
  validation and approval boundaries; it changes none of those settings yet.
- Later delivery evidence connects acceptance criteria to actual observations
  and an authorized human decision without duplicating an existing fact source.
- Historical replay must expose label-filtered candidates, confine single-service
  6/6 to its sampled scope, show both five corrections and seven regressions,
  distinguish schema integration from model effectiveness, and disclose unbound
  new test/helper files. Versions and timeouts need no sample annotation.
- Stop promotion if recording duplicates facts, wording/list maintenance dominates,
  traceability does not improve, or safety/contract/boundary protection weakens.

## Alternatives

- Expand gates/packs now: increases machinery before establishing net benefit.
- Freeze all governance repair: preserves stale guidance and known safety gaps.
- One gate for every metric in Markdown: catches syntax, not representative
  sampling or validity, and creates false positives on non-evaluation numbers.
- Merge four meta gates immediately: names do not measure cost, and required
  base gate ids cannot simply be removed by a consumer.

## Consequences

No runtime code, dependencies, live model calls, secrets, repository permission
changes, automatic approval/merge, or product iteration. Existing delivery checks
remain mandatory until a separately approved adoption change replaces policy.
Stage-one verification uses document review plus existing doctor, full tests,
example check and consumer gates; it does not claim an automated prose-truth test.
A/B adoption reduction was subsequently approved and implemented (change 0020).
The owner clarified that existing consumer and self work is already real delivery:
observe it without requiring an additional pilot or declaring product acceptance.

Execution departure: another task edited and committed consumer runtime files
during documentation work, including our staged consumer documents in its commit.
Preserve that history and do not claim its changes as this SPEC's implementation.
Qualify an exact consumer snapshot in a detached worktree rather than treating
the concurrently changing source checkout as a docs-only candidate.
