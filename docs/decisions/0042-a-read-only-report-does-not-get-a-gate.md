# 0042 — A read-only report does not get a gate

Status: accepted

## Problem

This repository's rule is that a rule which must always hold belongs in a gate, so every new command surface was expected to gain one. `survey` was the first that could not: three controlled experiments — adding `harness.manifest.json`, `package.json`, `AGENTS.md`, and `pyproject.toml` to a fixture inside the repository — produced byte-identical reports. Two gate designs were written and both were rejected by `prove`: one rebuilt its own fixture so the injected failure was healed before the assertion ran, and one asserted that a directory inside a git repository is not a git working tree, which is false because `rev-parse` walks up to the enclosing repository.

## Decision

A command gets a gate only when its assertion can be flipped by a change the proof's introduction step can make **inside the repository**, and `prove` is what decides that — a gate is written, then believed, and deleted if it cannot fire. A read-only report whose output does not change under repository-internal state is not gate-able; its behaviour belongs to its unit test (`test/survey.mjs`), and adding a gate for it produces exactly the two dead gates described above. The judgement is recorded here rather than left implicit, because "every feature needs a gate" was previously the unexamined assumption.

## Alternatives

- Keep a gate that always passes: it is a dead gate, the thing this repository calls out by name.
- Assert the refusal path from outside the repository (`mktemp -d`): nothing the introduction step can do from inside flips it, so `prove` cannot prove it either.
- Retire `survey` because it cannot be gated: the command is useful and its unit test is real; coverage, not gatehood, is what it can have.

## Consequences

- `survey` ships with its unit test and no gate; that is now a recorded decision, not a forgotten gap.
- The rule generalizes: before writing a gate, show the injection flips the assertion. The next candidates — `command-review`, `system-check`, `system-receipt-check` — each get that check first, and they pass it only because their receipts and snapshots live inside the repository.
- This record cannot be enforced by a check, by construction: it constrains which checks are written.
