# 0048 — Prove native integration on real repository tasks

Status: accepted

## Problem

Manifest skills are validated but not exposed to native agent discovery. Review
rules have no explicit task route in the entrypoint. Earlier guidance omitted
Claude Code's native AGENTS.md support, introduced in 2.1.277. The installed
Claude CLI is 2.1.71; its behavior cannot stand in for current support.

## Decision

Use this repository as the pilot. Reuse compositions to export the three pinned
base skills to .agents/skills (Codex/DSH) and .claude/skills (Claude), retaining
one authored source, existing output hashes and drift enforcement. No new
loader or manifest field is needed before observing the first pilot. Route
review tasks to REVIEW.md explicitly. Use AGENTS directly with current Claude;
do not generate a CLAUDE.md workaround by default or alter global settings.

Commit this plan first. Run bounded native CLI evaluations on isolated copies
of real repository revisions: baseline without exports, and treatment with
exports. Tasks are read-only engineering review and verification planning with
actual repository tests. Preserve raw traces outside version control, record
versions, tool evidence, results, elapsed time and available usage. Verify
claims against commands and resulting trees rather than model self-report.
Treat discovery probes separately from task success; never invent token savings
or statistical confidence from a small sample. Do not run model calls in npm test.

Use current Claude 2.1.310 in a temporary package cache without upgrading the
installed CLI or adding project dependencies. Use the installed Codex CLI;
attempt DSH only with its existing runtime and credentials. Bound retries/time
and record unavailable providers honestly. No product/game changes or remote
publishing are included in this pilot.

## Alternatives

- Add a second export framework: existing composition already owns generation.
- Assume a successful export means native loading: lacks behavioral evidence.
- Run only the installed old Claude: cannot assess the user's latest-version claim.

## Consequences

Native outputs are generated and must be changed at their base source. Add their
paths to existing surfaces and exercise missing/tampered output failure. Skill
guidance follows skill-creator's concise, progressively disclosed conventions;
no new universal rules are added from hypothetical failures. Current Claude
loading mode/provider/plugin availability is recorded separately from version.
External model use is bounded and opt-in; human product approval remains separate.

Observed departure: the first DSH native run used the skill but omitted this
repository's mandatory full suite/example. Clarify the pinned tier skill,
release a new immutable base/tool version 0.1.46, and rerun the native task.
Score task execution separately from repository DoD compliance. The first native
run could inspect its evaluator while baseline could not; hide scorer code in
future private fixtures, record the derived fixture revision, and do not infer
causal gains from this sample. Preserve all failed infrastructure attempts.
