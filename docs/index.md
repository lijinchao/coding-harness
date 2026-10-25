# Coding Harness knowledge map

Start with AGENTS and the task. Read only the relevant rows; linked documents
own their facts. This map does not copy their contents or authorize actions.

| Task / question | Authoritative source | When to read |
|---|---|---|
| Product boundaries and direction | [direction](direction.md) | Before changing scope or choosing a new subsystem |
| Current capabilities and next work | [roadmap](roadmap.md) | Before planning an iteration |
| Manifest fields and artifact contracts | [contracts](contracts.md), [schema](../schema/harness.manifest.schema.json) | Before adding or changing a declaration |
| Why a choice was made | [context decision](decisions/0046-context-map-contract.md) and relevant `docs/decisions/` record | Before revisiting that choice |
| Commands | [reference](reference.md) | Before using an unfamiliar CLI operation |
| Review criteria | [REVIEW.md](../REVIEW.md) | Before code review; findings do not grant approval |
| Knowledge map declaration | [context contract](context.md) | Before changing context routes or budgets |
| Context map measurements and limits | [pilot](context-map-pilot.md) | Before claiming token savings or improving routing |
| Native agent setup and task execution | [native guide](native-agents.md) | Before configuring agent discovery or interpreting native task results |
| Native pilot outcomes and blocked cases | [native pilot](native-agent-pilot.md) | Before claiming cross-agent task success or token savings |
| Release / pin / attestation | [release](release.md) | Before distributing or upgrading artifacts |
| Real consumer results and limits | [game-design pilot](game-design-adoption.md) | Before generalizing consumer practices |

Implementation facts live in `src/`, `bin/`, and `test/`; read them before
describing behavior. Skills are declared in the manifest and loaded at their
triggers, not pasted into this map. Product facts belong to each consumer.
