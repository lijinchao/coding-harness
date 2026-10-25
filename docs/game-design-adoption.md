# game-design adoption assessment

Decision: [0045](decisions/0045-game-design-adopts-with-native-artifacts.md).
Consumer: `/Users/jacklee/workspace/game-design`, adoption commit `4bd54bd`.
This is a governance adoption, without game behavior changes or remote publication.

## Actual contribution

The consumer already had stronger domain knowledge than a generic scaffold:
Chinese ADRs, PROGRESS, Make targets, Python regression tests, Godot smoke checks,
and product plans. Adoption retained those sources. Shared instructions compose
to HARNESS.md, while AGENTS remains the native map. The delivery-flow Pack adds
an inspectable plan/criterion/check mapping; its planned result is explicitly
not behavioral verification, human acceptance, or merge authority.

A concrete inconsistency was corrected: CI claimed to share `make verify`, but
actually copied lint/test commands. A regression first failed with
`CI must execute make verify`; CI now runs make setup and make verify. A new
ci-entrypoint gate injects a broken run step and must fail before restoring it.
This checks the consumer's current single-line run convention, not arbitrary YAML
or remotely configured branch protection.

Six local gates cover drift, doctor, manifest validation, CI entrypoint, existing
offline verification, and delivery planning. Five run in the fast phase; the
full phase reuses make verify rather than creating a second product test suite.
New CI governance runs in Shadow, captures actual step outcomes, archives a
healthy/would_block report, and never authorizes enforcement. Existing product
CI remains blocking. Gate severity alone does not configure branch protection.

## Distribution and costs

Kernel 0.1.43's tag is local-only. A 452045-byte Git bundle carries the exact
released commit `382bb1818524e37fd0e21c339694b95dfdccb968`; an immutable local
delivery-flow 0.1.0 release carries per-file hashes. Provenance and the consumer
lock record those identities. A fresh clone bootstrapped and passed check,
validate, and five fast gates without a sibling checkout or fetching the
unpublished upstream tag. This is a distribution workaround, not a source fork.
The consumer gains Node 22 as a development requirement and explicit upgrade
work. No runtime dependency was added to either product.

## Problems exposed in this tool

1. **Chinese path false positives (reproduced).** `surfaceCoverageProblems` uses
   newline-split `git ls-files`. Under Git's normal quoting, Chinese paths look
   like `"docs/...\\346..."` and fail otherwise correct surface globs. The
   consumer's doctor command uses process-only core.quotepath=false environment
   settings; no filenames or global Git settings were changed. Proper kernel
   correction requires NUL-delimited enumeration and regression cases for
   Unicode, spaces, and newlines. Audit `changedFiles` in the CLI too. Until a
   fixed release is adopted, the consumer uses full/fast targets rather than
   --changed/--since selection. The workaround does not support newline paths.
2. **Native document adaptation.** doctor requires English ADR headings/statuses;
   survey assumes default directories and can miss existing plans/decisions.
   The consumer leaves the decisions recommendation visibly unfulfilled rather
   than rewriting accepted ADRs or claiming absence of governance.
3. **Offline distribution.** Bundle bootstrap works with current mechanisms,
   but init/adopt does not offer a first-class audited offline export workflow.
   Manual provenance and artifact copying are avoidable integration burden.
4. **Environment contracts.** Formal verified receipts execute in Git archives;
   Python's .venv and Godot are not implied by tracked files. The consumer uses
   planned only, actual test logs, and explicit isolated-proof .venv carry.
   No fake verified/accepted result was generated.
5. **Feedback and observability.** Shadow reporting is consumer-owned glue.
   Gate logs measure checks, not task success/retries/time-to-green/human
   intervention. No reliability threshold is meaningful from this one pilot.

These remain upstream gaps; adopting a consumer does not resolve them. Fixes
should be independently planned, tested red/green, released, and upgraded. Do
not mutate the consumer's immutable 0.1.43 bundle or Pack in place.

## Continued learning and human decisions

Record a reproducible failure at its native source, add the smallest regression,
and promote persistent invariants to proved gates. Observe cost and false
positives in Shadow before a person chooses enforcement. Product task state
stays in PROGRESS; accepted architecture stays in native ADRs. Only repeated
cross-project mechanisms should enter base/Pack. Human decisions remain product
scope, playability, real-model acceptance, exceptions, and enforcement promotion.

The consumer handoff is `docs/engineering/harness.md`; final execution evidence
is recorded in its PROGRESS entry and lock.proofs. Local evidence cannot claim
that the new GitHub workflow or branch protection has run remotely.

Measured results: consumer make verify passed 177 tests (two dependency
deprecation warnings) in 119.19 seconds; Godot stage smoke passed 93 assertions;
five fast gates passed in about 1.53 seconds of check execution. All six gates
fired under isolated fault injection and passed after recovery; their recorded
proofs are current. This repository passed 203 tests and its consumer example
check matches 0.1.43. A stage smoke intentionally exercises a missing background
resource; its expected ERROR is not evidence of a failed suite. Full product
E2E, paid/real model behavior, remote CI, and human product acceptance were not
verified in this adoption.
