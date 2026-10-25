# 0045 — Adopt game-design around its existing artifacts

Status: accepted

## Problem

game-design has native Chinese ADRs, Make targets, pytest, Godot, and product
plans, but no pinned coding-harness integration. Replacing those owners would
duplicate knowledge. The current 0.1.43 tool tag is local-only, so a network-only
bootstrap or a sibling checkout path would not make a portable consumer.

## Decision

Adopt in game-design with a version/commit-pinned Git bundle of the released
tool and an immutable local Pack release. Preserve its AGENTS map and native
ADRs; compose HARNESS.md instead. Reuse Make targets and add criterion mapping,
proved governance checks, and CI Shadow evidence before changing enforcement.
Keep product status in PROGRESS and record observations that can lead to
regression checks or upstream improvements. Do not publish remote tags or
change game behavior. Test the cold bundle path and report actual adoption
costs and limitations in this repository after the consumer works.

## Alternatives

- Force the repository into the kernel's default document layout: loses native
  context and creates a second source of truth.
- Pin a sibling path or an unpublished remote tag: not reproducible in CI.
- Promote every new check immediately: no evidence yet about cost or noise.

## Consequences

Commit this plan before implementation. The consumer gains Node.js as a dev
tool, a small immutable distribution artifact, and explicit update duties.
User experience, real-model results, and human acceptance stay separately
qualified. Future rules require observed evidence and a regression; shared
mechanisms require more than one consumer before entering the base.
