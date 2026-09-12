# 0013 — The release phase is declared, not built in

Status: implemented

## Problem

Automated tests can pass while the artifact cannot be packaged or released. A harness should be able to ask for a packaging check, but a packaging command is application-specific — Godot export, `npm pack`, `docker build`, a JVM jar — and the base must not carry any one of them.

## Decision

A base release may declare `requiredPhases` and `recommendedPhases`. A gate's `phase` satisfies the requirement. Base `0.1.15` recommends the `release` phase: `doctor` warns when no gate carries it, and a repository that needs packaging declares its own gate with `phase: "release"` and its own `prove_fires_command`. `harness gates --phase release` runs the unphased gates plus the release gate. The base ships no packaging command and no application-specific gate.

## Alternatives

- Ship a packaging gate per ecosystem: the base would grow a matrix of application types, and every repository outside the matrix would still be unserved.
- Make the release phase required: a library or a service without a packaging artifact would have to invent a gate to satisfy it, which is the definition of a dead gate.
- Let each repository invent its own phase name: nothing would connect repositories, and no base release could recommend a phase.

## Consequences

- The base can say "you should have a release check" without knowing what a release is, and each repository supplies the command and its proof.
- Both repositories currently warn rather than fail: `coding-harness` has not built a release-phase gate, and `starlight-garden` has no declared packaging entry point yet.
- A repository may promote the phase to required in its own delta once it has a real packaging check.
