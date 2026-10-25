# Context map pilot — 2026-10-25

Design: [0046](decisions/0046-context-map-contract.md). Contract:
[context.md](context.md). Local release 0.1.44 pins
`0e1c61df050c74b29974d9aab404e11520330cf5`; the tag has not been pushed.

## Result and boundaries

Optional declarations now connect entrypoint, sources, scope globs, reading
conditions and project-wide authority identifiers. Doctor validates declared
files and their real paths, routing reachability and anchors, tracked scope
matches, uniqueness and entrypoint budget. maxBytes counts UTF-8 bytes;
maxWords retains its old whitespace meaning. Neither measures model tokens.
This is navigation governance; the host/agent still owns context loading.
No task recommender, semantic correctness evaluator or automatic inclusion of
linked bodies was implemented.

The shared base adds one map-first convention. coding-harness composes its
AGENTS from source, points to a 1561-byte native index and declares five
sources. Its AGENTS is 3467/8192 bytes. game-design preserves its native
AGENTS (12263/16384 bytes), existing docs/index and Chinese ADRs; its map is
10714/24576 bytes and it declares four sources. These are measured sizes and
chosen ceilings, not a demonstrated reduction in tokens. No accepted ADR was
rewritten; current product state remains PROGRESS.

## Validation

The new regressions first failed for ignored byte budgets, quoted Git paths,
unsupported declarations, absent context checks, a newline glob mismatch and
a broken routing anchor. They passed after implementation. The final self gate
suite ran 213 tests with 0 failures; all ten gates and their isolated fault/
recovery proofs passed. Schema agreement covers the new keys and source fields.
The example checks against 0.1.44. Release acceptance is recorded by the local
attestation after the final proof/lock update.

Consumer make verify passed 177 tests with two existing dependency deprecation
warnings in 132.23 seconds; Godot stage smoke passed 93 assertions. Its changed
doctor proof points a declared context source at a missing file, observes
failure, restores it, and must pass. Final consumer proof status is recorded
in its manifest and PROGRESS, not inferred from this narrative.

The corrected consumer snapshot completed all six isolated fault/recovery
proofs and prove --check confirmed current records bound to 0.1.44. An earlier
snapshot was rejected because its delivery plan remained invalid after revert;
concurrent gate-log collection also tripped the shared-cache mutation check.
Those attempts recorded no new proofs. Final validation ran without concurrent
writes to the borrowed cache; worktree isolation does not copy proofCarry state.

An empty-cache consumer clone passed check, validate and all five fast gates
using the fixed 478216-byte tool bundle. Default Git quoting now works;
the consumer removed its process-level quotepath workaround. NUL delimiters
also fix CLI --since path selection; regressions include Chinese, spaces and
newline filenames. No global Git configuration was changed.

## Useful failure and remaining gaps

The consumer's first revised delivery plan referenced the existing Godot
smoke file outside its declared scope. The Pack correctly blocked the plan;
the exact test file was added to validation scope and a fresh clone passed.
The file's contents were unchanged. This exposed a modeling cost: the Pack
currently puts implementation and verification paths into the same scope.
A future contract should distinguish them, rather than widening product edits
or substituting an unrelated test filename to silence validation.

The native AGENTS remains relatively long. Budgeting prevents unchecked
growth; it does not shorten existing prose. Future work should measure actual
reading cost, task success, missed-context rework and human corrections before
adjusting it. when is a declared reading condition, not an executable selector.
Authority uniqueness cannot detect two prose documents contradicting each
other. Survey's heuristic inventory and English ADR validation still need
native adapters; explicit context sources do not repair those old classifiers.
No real-model run, full game E2E, human product acceptance, remote CI run,
enforcement promotion or measured token saving is claimed by this pilot.
