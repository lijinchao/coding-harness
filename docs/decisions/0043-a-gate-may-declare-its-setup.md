# 0043 — A gate may declare the setup its command needs

Status: accepted

## Problem

`prove` assumes a gate command is self-contained and idempotent: the introduction flips repository state, the command is watched to fail, the revert restores it, and the command passes. Four attempts to gate new command surfaces broke that assumption in four different ways — a command that rebuilt the fixture the injection deleted (self-healing); an assertion about a directory inside a git repository being "not a git working tree" (environment misjudgement); a receipt written where the tool refuses to write (product versus contract); and, finally, a receipt that **cannot be committed at all** because `command-review` requires it to live outside the source repository. The fourth is not a per-gate mistake: there is nowhere to pre-stage the product, so any command that produces it heals the injection, and the gate can never fire. `system-run` writes receipts the same way, and evidence gates will write screenshots and traces outside the tree.

## Decision

A gate may declare `setup_command`: a single-line command run **before** the gate's `command`, in CI, in a local `gates` run, and in each phase of a proof. Setup is not part of the assertion — it exists so that a product the repository cannot commit is present when the command runs. A proof of such a gate means: with setup run and no introduction, the command passes; after the introduction, it fails; after the revert, setup runs again and the command passes. The gate's behavioural definition — the hash a proof binds — includes `setup_command` when it is declared, so a proof states which setup it was proven with; gates that declare none keep their current definition and their existing proofs stay valid. `setup_command` must be a single line, and it does not remove the requirement that a blocking gate carries both `prove_fires_command` and `revert_command`.

## Alternatives

- Accept unit-test-only coverage for these tools, as [0042](0042-a-read-only-report-does-not-get-a-gate.md) does for `survey`: honest, and it would leave the repository's highest-privilege surfaces — the ones that execute commands at a pinned revision — ungated.
- Let the tools write their receipts inside the repository: it weakens a deliberate safety property, and `command-review` refuses it for a reason.
- Pre-stage the product with `governance.proofCarry`: carry exists for untracked state inside the repository, and a product that must live outside it is the opposite case; carry would also be invisible to the isolated proof's cleanliness contract.

## Consequences

- The "artifact outside the repository" class becomes gate-able; the other three classes stay design rules that a proof continues to catch — 0042 records them, and this record does not fix them.
- `prove` gains a phase, and every place that enumerates the phases of a proof — the command, the record format, the documentation of what a proof means — has to agree on it; the schema and the validator must move together as they always do.
- The record is `accepted` rather than `implemented`: no key, no schema entry, and no proof phase exists yet, and the change that lands it must bring a test that shows a gate failing on its injection and passing with its setup, or it repeats the four failures this record was written from.
