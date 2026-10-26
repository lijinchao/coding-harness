# Governance cost review — stage-one proposal

Status: proposed; settings below are **not applied**.
Date: 2026-10-27

[Decision 0052](decisions/0052-evidence-first-delivery.md) owns the accepted SPEC.
This is its bounded adoption proposal, not a new runtime contract or pack.

## Observed baseline

Consumer: agentic-ops at `358f5594106734f93ec02967a1646dbeca20f42a`, tool
0.1.49 at `c5fb3cd3dd92f32b49861ba18b0d341819ff951c`.
Its manifest has 14 gates, 104 document entries (94 maxWords, 11 maxBytes,
one entry has both), and 34 stored gate-health observations, no delivery-outcome
observations. These counts describe inventory, not cost, effect or adequacy.
The report history lacks consistent source-revision binding; do not compare its
old durations with current runs as a controlled performance experiment.

Current guide text already describes explicit proof inputs correctly. The adoption
report still described declaration-only binding as current; stage one corrects it
without rewriting historical results. The new models contract test is executed by
the test glob but absent from models.proof_inputs. Fresh proofs do not establish
that the checker inventory is complete. No dependency inference is promised.

## Proposed next change: two small adoption adjustments

### A. Keep document checks, reduce hard budgets from 104 entries to four

Retain every governance.docs path and its link/existence/forbidden-text checks.
Retain current settings on these four agent entry/navigation documents:

| Path | Retained settings |
|---|---|
| AGENTS.md | maxBytes 8192, maxWords 460 |
| AGENTS.delta.md | maxWords 430 |
| REVIEW.md | maxWords 260 |
| docs/index.md | maxBytes 6000 |

For the other 100 entries, remove only maxWords/maxBytes:

- 29 declared documents under docs/decisions/.
- 47 declared documents under docs/changes/.
- 24 other documents, enumerated below.

The counts are frozen to the baseline; re-enumerate and review drift before
editing. This does not register a budget for every newly added record.

| Remaining paths with proposed budget removal |
|---|
| README.md; docs/development.md; docs/coding-harness-adoption.md; docs/roadmap.md |
| docs/design/2026-09-23-agentic-operations-investigation-runtime-design.md |
| evals/rcaeval_re2ob/ATTRIBUTION.md; evals/rcaeval_ob/ATTRIBUTION.md; evals/postmortem/ATTRIBUTION.md; evals/rcaeval_ss/ATTRIBUTION.md |
| docs/MANUAL_VERIFICATION.md; docs/contracts/schema-compatibility.md; docs/domains/authoring-guide.md |
| docs/evals/scoring.md; docs/evals/arms.md; docs/evals/data-provenance.md |
| docs/postmortems/README.md |
| docs/security/risk-matrix.md; docs/security/authorization.md; docs/security/data-classification.md; docs/security/review-record.md |
| docs/runbooks/rollback-to-existing-flow.md; docs/runbooks/local-investigation.md; docs/runbooks/proof-refresh.md |
| docs/runtime/agent-backend-contract-test-plan.md |

Risk: ordinary documents can grow. Mitigation: existing source maps, ownership
and review remain; review duplication and relevance rather than enforcing a
universal word count. Whitespace word counting is not a multilingual token
budget. Do not claim token savings from removing limits or retaining byte caps.
This proposal does not alter coding-harness's own budget settings.

### B. Stop turning every new test command into a new gate

Replace the consumer development sentence requiring a new gate per stage with:
register the command in the existing command owner, prefer an existing gate;
add a separate gate only for an independently useful invariant with observed
failure and reviewed maintenance cost. This changes guidance, not gate coverage.

Clarify that focused commands are development feedback: an intended red test
is not failed delivery, and a focused green result is not full qualification.
Keep the current mandatory full-gates delivery requirement. A future proposal
may use changed-surface delivery only after selection coverage is qualified;
do not advertise it as approved now or bypass proof checks to achieve green.

## Retain or defer, rather than remove

| Item | Disposition and reason |
|---|---|
| validate / doctor / harness-drift | Retain ids and behavior; base requires the latter two. Fewer names alone do not reduce work. |
| metrics | Retain current gate/budget for this proposal. Treat outputs as check-health descriptions; repair-versus-flakiness attribution needs separate design. |
| proof_inputs | Retain strict policy. Review known new-test/helper omissions separately and record affected proofs only after an authorized change. |
| product contracts, security, domain boundary | Retain commands and coverage. Fewer governance steps cannot weaken these protections. |
| CI / proof age / bot permissions | Unchanged. Weekly checks remain read-only; no automatic renewal or Agent wakeup. |
| delivery pack / legibility / eval migration | Do not require adoption to use the pilot; reuse the project's owners and report outlet. |

## Validation for A/B, if approved

1. Freeze the current source revision and inventory. Compare parsed manifests:
   only the listed document maxWords/maxBytes fields may change; gate definitions,
   inputs, surfaces, security declarations, tool pins and locks must remain equal.
2. Retain 104 document declarations with exactly four budgeted entries at this
   baseline. No path or forbidden-text rule may disappear. Do not fill a newly
   required budget by silently reclassifying another document.
3. On disposable fixtures, a long non-entry document is no longer rejected
   solely for length; missing paths, broken links and retained entry budgets
   still fail their existing checks. Run producer document tests and consumer
   doctor to confirm both sides, not just a green happy path.
4. Run the consumer's full gates and proof freshness checks. Do not re-record
   unchanged proofs solely because documentation wording changed.
5. Review the guide diff: no unconditional requirement to add a gate per test
   command, no suggestion that targeted green means delivery accepted.

## Subsequent pilot, not performed by this change

Choose three separately authorized product tasks. Use each existing change/PR
record for criterion -> test/operation -> actual result -> limits -> human decision.
Keep checks passed, adequacy reviewed and product accepted distinct; unknown or
pending cannot become accepted. No parallel required ledger or new schema.

Record product uncertainty work separately from governance maintenance, check
elapsed time, rule-caused rework, defect discovery channel, and missing data.
Do not substitute commits, code share, gate count or first-pass rate for benefit.
Compare like tasks only; this small observational pilot cannot establish causality.

Review decision-bearing claims through the existing report outlet: source identity,
sample exclusions/strata, evidence tier, paired wins/losses, limitations and review.
Replay the five method cases in SPEC 0052 before proposing automation. No global
Markdown-number gate, arbitrary minimum sample size, or new blocking claim rule.
Raw model responses require separate data-handling authority and redaction.

Stop and revise if duplication or list maintenance dominates, traceability does
not improve, or safety/contract/boundary checks weaken. At pilot end, the owner
chooses retain, revise or revert; there is no automatic promotion to Kernel.

## Approval requested

Approve **A/B only** as the next implementation: remove the 100 non-entry budgets
while retaining all document checks, and replace automatic gate proliferation
with reuse-first development guidance. Gate consolidation, metrics enforcement,
proof inventory repair and actual product tasks remain separately scoped work.
