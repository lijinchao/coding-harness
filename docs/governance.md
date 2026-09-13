# Governance

A harness decays unless someone owns it and something forces it to change. This page defines who owns the shared base, where changes come from, how versions move, and how a team knows the harness still works.

## Ownership

One owner holds the shared base. The owner reviews every base change and signs off policy updates. A repository-local delta needs no shared review.

Name the owner in the base repository, and route base changes to it. Ownership is a role, not spare time: an unowned base is edited by whoever is blocked that day, which is how a base fills with local exceptions.

## Where changes come from

Every harness change traces to an observed failure:

- a mistake the agent made twice;
- an incident;
- a drift finding;
- a gate that no longer fires.

A rule with no observed failure is not admissible. This keeps the base small and stops it from filling with speculative rules.

Record the failure in the change itself: the commit message names the observation, and a decision record carries the alternatives that lost.

## The promotion ladder

Promote a rule only as evidence accumulates:

```text
observed failure -> skill -> hook -> CI check -> structural test -> shared base
```

Start with the weakest carrier that works. Promote a rule when it has to hold, not when it merely happens often.

## Versioning and upgrade

- A repository pins one base version in `harness.manifest.json`.
- `harness sync` composes the base and the delta, and rewrites the lock.
- `harness check` fails when a composed output no longer matches the pin.
- `harness upgrade --to <version>` moves the pin. The repository's own checks must pass before the bump merges.

A base release is a versioned artifact: publish it, tag it, and let consumers pull it. Never edit a consumer's files directly; a base change that would lower a consumer's pass rate is reviewed before release.

## Does the harness still work?

Read two signals together.

- **First-pass check rate.** When the checks catch mistakes before a human reads the diff, review focuses on intent. When the rate does not move, either a guide is not triggering or a gate is not firing.
- **Repeat findings.** A review that cites the same policy a second time means the guide carrying it is not working. Promote it to a gate, or fix the guide.

A gate that never fires is ambiguous: either the code is clean, or the sensor is dead. Resolve the ambiguity by proving the gate can fail.

## Prove a gate still fires

A blocking gate must declare `prove_fires_command` (introduce the failure) and `revert_command` (undo it). `harness validate` rejects a blocking gate without both, and `harness prove` runs the three steps and exits non-zero when the gate does not fire:

1. Run `prove_fires_command` to introduce the failure.
2. Run the gate's `command` and confirm it exits non-zero.
3. Run `revert_command` and confirm the gate exits zero again.

There is no default revert: `harness prove` refuses to guess. It also refuses to start unless the working tree is clean, and refuses to report success unless it is clean again after the revert, so a proof cannot discard uncommitted work; `--timeout` bounds every command. `harness prove --record` stores one record per proved gate: when, the tool commit, and a hash of the gate's definition. A repository that declares `governance.proofs` — `require` scope (`blocking`, `all`, `none`) and `maxAgeDays` (default 30) — fails `doctor` on a gate in scope with no record, a changed definition, another tool commit, or an expired one.

## Check the governance facts

A base release declares its required gates, governance keys, required CI commands, and gate phases in `requirements.json`; `harness check` fails until a consumer adopts them, and a recommended phase or governance key is a `doctor` warning instead. A version pin implies the base's contract, not only its content.

A harness can pass every gate and still be wrong about itself: a README naming an old version, a decision record missing an alternative, an owner nobody routes to. `harness doctor --manifest <path>` checks the facts the manifest declares — the product version source and its mentions, decision-record sections and lifecycle status, change-record verification, owner routing, the declared CI file's harness commands, the existence of a declared manual-verification path, the links and budgets of declared documents, and the completeness of the declared instruction tree — so governance-fact drift fails a gate instead of surviving on trust. A recommended key that is absent is a warning, not a failure. The [writing-a-gate](../base/skills/writing-a-gate/SKILL.md) skill owns the procedure.

## Effectiveness signals

`harness gates --report <file>` appends a run summary that `harness metrics --log <file>` reads: runs, green, first-pass rate, per-gate failures, skips, and timeouts, flakiness (a gate that both passed and failed), run duration percentiles, and the slowest gates. A gate that is flaky, that keeps failing, or that keeps getting slower is a guide or a gate to fix, not noise to tolerate.

## Pruning

Delete a harness item when:

- its `prove_fires` action no longer applies, or a stronger carrier supersedes the gate;
- the failure it was written for can no longer occur;
- two items now cover the same rule.

A guide is cheap to keep and expensive to trust. Delete dead items instead of leaving them to erode confidence in the rest.
