# 0031 — A proof is bound to its gate definition and its tool

Status: implemented

## Problem

The governance document said a gate whose proof had not been run recently is treated as broken, and nothing implemented it. `lock.proofs` held a single string per gate — time at commit — and `doctor` read it only to reject an id that no longer named a gate. The gap was visible in this repository: at 0.1.30 the records still named the 0.1.27 tool commit, the new `release` and `example` gates had no record at all, and every gate passed anyway. A document that promises a check which does not exist is the same defect as a guide without a gate.

## Decision

`prove --record` writes an object per gate: `at`, the tool commit that ran it, and `definition`, a SHA-256 of the gate's behavioural fields — command, proof commands, `expect`, severity, phase, dependencies, `always` — while prose such as `protects` stays outside the hash, because rewording what a gate defends does not invalidate the run that watched it fail. A repository declares the policy in `governance.proofs`: `require` is `blocking` (the default), `all`, or `none`, and `maxAgeDays` defaults to 30. `doctor` then fails a gate in scope with no record, a legacy unbound record, a record whose definition no longer matches, a record from another tool commit, or one past the window. The base recommends the key rather than requiring it, so a consumer adopts the policy by declaring it and recording proofs, and a repository that declares nothing gains only the existing unknown-gate check.

## Alternatives

- Require the policy in every consumer at once: their CI would fail until each one re-proves every gate, which is a migration, not a check.
- Hash the whole gate object: a word change in `protects` would demand a re-proof, and a proof that fires for cosmetic edits stops being read.
- Store freshness only as the tool commit: a gate can change while the tool does not, which is the more common drift.
- Warn instead of fail: this repository's whole rule is that a rule which must hold belongs in a gate; a warning would repeat the original defect one level down.

## Consequences

- The claim in [governance.md](../governance.md) is now what the code does, and `test/proofs.test.mjs` covers each rejection.
- This repository declares `require: blocking` and `maxAgeDays: 30` and re-records all six proofs, so `lock.proofs` names the pinned tool commit and every blocking gate.
- A proof is invalidated by a tool upgrade, so every release of this repository ends with `prove --record`; that is the cost of the binding and it is deliberate.
- Records stay advisory for consumers until they declare the policy; the release that adds the key reports it as a recommended gap instead of a failure.
