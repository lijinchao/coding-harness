# Delivery-flow pilot and daily adoption

## The self pilot

The CLI is a software product: repository owners initialize, compose, validate,
run gates, and inspect evidence. coding-harness can therefore trial delivery
without inventing another product. `delivery.plan.json` maps three acceptance
criteria to frozen integration tests. Unit and shipped-artifact E2E are
explicitly waived for this slice; the report must not claim either was run.
`test/delivery-evidence.test.mjs` separately tests real baseline/candidate
receipts, diagnostic hashes, changed scope, and unapproved acceptance.

`packs/delivery-flow` is locally released under `dist/packs/delivery-flow`.
The existing kernel resolves it, verifies its hashes, and records it in
`lock.packs`. `scripts/check-delivery.mjs` imports that released checker.
The pack's always-selected plan gate fails on empty acceptance criteria and
passes after restoring the plan. The first trial used kernel 0.1.41. It exposed
a writeback defect, so the self/example pins move to a local 0.1.42 release;
neither its tag nor a pack tag is published to the remote.

The first red test scaffold printed `unimplemented`. With the test runner
working, criteria validation still failed (`0 !== 1`) and the positive report
was not `planned`. The six tests in `test/delivery-flow.test.mjs` were committed
before the implementation. Replay their baseline and candidate with:

```sh
node scripts/capture-delivery-pilot.mjs --baseline <red-commit> \
  --candidate <green-commit> --out /outside/the/repository/evidence
```

This explicitly runs the reviewed self-pilot command in exact-revision
archives. The report links frozen tests, expected failure text and its output
hash, the passing candidate, and still-matching scope. It leaves human
acceptance pending. It is scope evidence, not whole-product qualification.

## game-design: inspected, not migrated

At `f2d5bb4`, game-design has no `harness.manifest.json`, bootstrap pin, pack,
or lock. `harness survey` correctly reports `not-adopted`. It already has a
substantial local harness: product criteria in `AGENTS.md`, append-only ADRs
under `docs/architecture/adr`, plans, `PROGRESS.md`, an offline `make verify`,
pytest contracts, narrative audits, Godot smokes, and real-model play tools.
Keep these owners; do not rename them to satisfy our preferred directory names.

The offline `make verify` run passed ruff and 174 tests with two dependency
deprecation warnings. It took 101.69 seconds, while the instructions still say
about three seconds. This difference needs measurement, not an automatic
performance verdict: runner and environment are not controlled here.
No model API, credential, backend server, or interactive player session was used.
Offline tests therefore do not establish visual quality or real-model behavior.
The existing Godot `make smoke-stage` also passed 93 assertions. It intentionally
loads a missing background to test fallback, producing an expected error and
warning before its successful verdict. This is why a generic ban on all
`ERROR:` output would be wrong for that command; the adapter must recognize
the specific expected diagnostic or produce a structured assertion summary.

| Existing artifact | Harness integration |
|---|---|
| Product plan / ADR | `design` links to it; criterion ids identify observable results |
| `Makefile` / pytest | Checks reuse exact targets or focused commands |
| `test_api_contracts_v25.py` | Contract/integration evidence; not a claim of Godot E2E |
| `make smoke-stage` | Client component smoke, separate from server/model qualification |
| `make smoke-client` | Client/backend E2E with explicit server readiness and teardown |
| `play-live` / `calibrate` | External qualification with separate authority and model identity |
| `PROGRESS.md` | Continues to own product status; a report references it |
| CI / PR review | Archives revision-bound evidence and authenticates human decisions |

Its CI describes the same-entrypoint principle but expands ruff and pytest
instead of invoking `make verify`. Godot checks remain local. That is an
observable drift opportunity, not evidence that today's commands differ.

## Findings exposed in our harness

1. **Naming bias in survey.** The report found 30 architecture files but zero
   decisions, status, and workflow files. It misses `docs/architecture/adr`,
   `PROGRESS.md`, and `docs/plans/`. Counts are inventory heuristics, not a
   maturity score. Explicit source mappings should precede auto-discovery.
2. **Pack assets need an adapter.** Resolution pins arbitrary pack files, but
   does not provide a portable entrypoint/template installer. This pilot uses
   a small reviewed import wrapper. It neither copies checker code into a
   consumer nor pretends that asset discovery is automatic.
3. **Archives are not build environments.** command-review deliberately exports
   committed files only. game-design's ignored `.venv`, Godot installation,
   caches, server state, and optional voice assets are absent. Its mutating
   pytest caches would also make a green command `mutated`. Daily integration
   needs environment/artifact identity and the existing system-run route, not
   weakening receipt semantics until every command turns green.
4. **Verification is not approval.** A name is unauthenticated data. The pack
   binds a declared decision but still reports authentication false and grants
   no merge authority. Protected review remains the decision channel.
5. **Metrics and freshness remain incomplete.** Deliberate red observations
   are kept out of gate-health history. The older metric implementation still
   conflates repaired failures and flakiness; persistent CI history and an
   attribution model need a separate change. Proofs expire after thirty days;
   the current work refreshes them explicitly, not through a new scheduler.
6. **Local retries exposed a real gate defect.** command-review used a shared
   `cr.json`, so a second run failed on an existing receipt. The regression
   test now runs it twice. Its adapter owns a unique temporary directory and
   removes it; failure injection changes a tracked expected-command fixture.
7. **Test isolation exposed a test defect.** An isolated full-suite proof
   intermittently failed after revert, while a standalone isolated rerun passed.
   The cleanup test compared the entire process-global temporary namespace.
   Deterministically introducing another caller's directory reproduced that
   false failure. It now checks deletion of its actual export and parent and
   preservation of the unrelated caller, rather than weakening cleanup checks.
8. **Proof recording broke a real pack consumer.** All ten proofs passed, but
   the writer persisted merged pack gates/surfaces into the raw manifest. The
   next command failed on a duplicate contribution. The kernel now persists
   the original declarations plus the updated lock. The adjacent upgrade path
   also needed to persist its new root version. A regression covers record,
   reload, re-prove, upgrade, and check; this is why a green single run was not
   sufficient evidence for the delivery workflow.

## How to combine this with ordinary development

Choose one behavior slice, its existing design, and an owner-approved scope.
Link criteria to focused tests and explain any omitted tier. Commit those
tests, observe an expected failure, implement, and preserve the test content
through the passing candidate. Record ordinary lint/build/test results
separately from deliberately red experiments. Package and test the artifact
users actually install when a release is in scope.

Attach the resulting criterion/evidence report to the PR. Humans decide goal
changes, permissions, architecture tradeoffs, UX, and final acceptance. AI can
run the intervening checks and address failures within the approved scope.
Convert repeated findings into proved checks, initially observe noisy checks
in Shadow, and retire redundant rules. Judge progress by fewer repeated
defects and less review work, not by gate count.
