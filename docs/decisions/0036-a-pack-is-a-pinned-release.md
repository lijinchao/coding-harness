# 0036 — A pack is a pinned release whose contribution is declared

Status: proposed

## Problem

The kernel is portable because it carries no product facts, and that is also why depth has nowhere to live: a stack's architecture checks, hygiene rules, test tiers, and CI matrix belong to that stack, not to every repository. Vendoring them into the base makes one product's facts universal; copying them into each repository lets them drift. The pack layer is the answer in [direction.md](../direction.md), and its semantics have to be fixed before an interface exists, because a pack injects shell commands and agent instructions into someone else's repository.

## Decision

A pack is a released, hashed, pinned artifact shaped like the base: a `pack.json` declares the gates, surfaces, skills, document templates, and CI matrix it contributes, and every file is verified against the pack's release record. The contract:

- **Identity.** Gate, surface, and skill ids are namespaced `pack-id/name`; a pack that ships an unnamespaced id is rejected, and two packs may never define the same id.
- **Merge order.** Kernel defaults, then each declared pack in declaration order, then the repository delta. Later layers may not silently change an earlier layer's gate.
- **Overrides.** Denied by default. A repository that overrides a pack gate writes the override explicitly, and the lock records it, so an upgrade never erases a decision nobody can see.
- **Compatibility.** `pack.json` declares a `kernelVersion` range, its own pack dependencies, and the packs it conflicts with; resolution fails rather than guessing.
- **Trust.** A hash proves immutability, not safety. A pack names its source, and adopting one is an authorization to run its commands and read its instructions — the same authorization the base already requires, stated for a third party.
- **Atomic resolution.** Fetch, verify, and merge every pack before writing anything; a partial merge is worse than a refusal.
- **Proof.** A pack gate's failure injection cannot assume one repository's layout: it ships a parameterized fixture, or the pack owns a conformance repository that proves its gates fire there.
- **Provenance.** Every generated file, gate, and skill resolves to the pack, version, and per-file hash that produced it.
- **Diff.** `harness diff` and `upgrade` report new and removed gates, skills, surfaces, commands, and required permissions — not only file changes.
- **Metrics.** Pack gates and future evals share one run schema, with `gate-health` and `delivery-outcome` as distinct kinds, so a budget never averages the two.

## Alternatives

- A `packs` field that vendors content into the manifest: copies drift, and the repository loses the pin.
- Deliver packs as guides a repository copies: the same drift, without a hash.
- Let packs overwrite each other by order: silent conflict is the failure mode a namespace exists to prevent.
- Treat a signed pack as trusted: signatures say who published, not what the commands do.

## Consequences

- The pack interface reuses release, hash, verification, and lock machinery; a second mechanism for the same job is the defect this record forbids.
- A pack can make a repository red on adoption; the conformance repository is what keeps that from being a surprise.
- This is `proposed`: the interface and the first packs land under it, and the status moves to `accepted` when the interface is agreed and `implemented` when a real pack is composed by a real consumer.
