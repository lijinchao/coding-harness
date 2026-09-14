# Legibility

An agent can only change what it can see. `governance.legibility` declares how a fresh worktree brings the application up, decides it is ready, observes it, resets it, and shuts it down — so evidence gates and evals have something portable to target. The contract is [0037](decisions/0037-legibility-is-a-declared-contract.md).

## Declaring it

```json
"legibility": {
  "start": { "command": "make up" },
  "ready": { "command": "curl -sf localhost:3000/health" },
  "observe.ui": { "command": "make shot", "evidence": "artifacts/ui" },
  "observe.logs": { "command": "make logs" },
  "reset": { "command": "make reset" },
  "teardown": { "command": "make down" }
}
```

| Adapter | The question it answers |
|---|---|
| `start` | How does a fresh worktree bring the application up? |
| `ready` | How is "actually ready" decided, rather than "the process started"? |
| `observe.ui` | Where does a screenshot or DOM snapshot land? |
| `observe.logs` | How are structured logs queried? |
| `observe.metrics` | Where do the numbers come from? |
| `observe.traces` | Where does a request's trace land? |
| `reset` | How is deterministic state restored between attempts? |
| `teardown` | How are ports and child processes released? |

## What is checked

`harness validate` rejects an unknown adapter, a command that is not a single line, an `evidence` path that is absolute or escapes the repository, `start` without `ready` (or the reverse), and `teardown` without `start`. The check is static: it never runs a command, so it works on a machine with no application to start.

## What the harness does not do

It does not implement an adapter, launch a browser, start a metrics store, or assert on application behaviour. Those belong to the repository, and to its own gates and evals. A pack may write gates that *call* these adapters — that is what makes a web-evidence pack possible — but the commands stay the repository's.

## Tonight's honest state

No repository runs one of these end to end yet. A declaration that says "ready" while the port is closed produces false confidence, so the first repository that wires the adapters to a real application is what turns this from a contract into practice.
