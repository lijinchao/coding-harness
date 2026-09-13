# 0034 — The direction is a kernel, packs, a legibility contract, and evals

Status: accepted

## Problem

The project had a strong kernel and no stated direction, so every review produced another manifest field: the kernel grew, and the layers that make an agent's delivery loop possible — the application being legible to the agent, and the agent's delivery being measured — stayed unbuilt. Two references pull in different directions. OpenAI's harness engineering describes the environment an agent needs; DeepSeek Harness demonstrates mechanisms that survive a complex product. Adopting either wholesale fails: the first is a method rather than a specification, and the second carries product facts no other repository shares.

## Decision

[`docs/direction.md`](../direction.md) states the direction and is the document this project defends. The kernel stays portable, strict, and product-free. Depth arrives as released, hashed **packs** rather than as core fields, so a stack's gates and skills can be deep without making every repository carry them. A **legibility contract** declares how a worktree's application starts, becomes ready, is observed, is reset, and is torn down — declared and validated by the harness, implemented by the repository. **Behavioral evals** record task contracts and feed the metrics window with delivery outcomes rather than gate health. The investment proportion is 50% legibility and evals, 30% DeepSeek-derived mechanisms through packs, 20% kernel. The order is release transaction, pack interface, first packs, legibility, evals, and only then agent-to-agent review, repair, and merge.

## Alternatives

- Put DeepSeek's rules into the base: it makes one product's facts universal, turns the base into a long rulebook, and contradicts progressive disclosure.
- Stay kernel-only and leave legibility to each repository: it repeats the gap this decision closes — the harness would keep enforcing rules while proving nothing about whether an agent can deliver.
- Build the autonomous loop first: measuring comes before trusting; an autopilot over an unmeasured loop cannot be evaluated.
- Make packs a manifest field that vendors their content: vendoring copies rules into consumers and lets them drift; a pack as a pinned release is the mechanism the base already uses for itself.

## Consequences

- A new repository still gets only the kernel; depth is opt-in and versioned.
- The pack interface is the next kernel change, and it must reuse the release, hash, and pin machinery rather than invent a second one.
- The legibility contract and evals are declared but unbuilt: this record is `accepted`, not `implemented`, and a status that outlives the work is a lie the lifecycle forbids.
- `release-ready` makes the release transaction checkable now, which is the one part of this direction that is already mechanism rather than plan.
