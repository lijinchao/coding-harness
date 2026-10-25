# Optional context map contract

Declare `governance.context` to route an agent to existing repository sources.
It does not concatenate their bodies, implement retrieval, or prove the agent
read or understood them. The project retains its filenames and language.

```json
{
  "docs": [{"path": "AGENTS.md", "maxBytes": 8192}],
  "context": {
    "entrypoint": "AGENTS.md",
    "sources": [{
      "id": "map", "path": "docs/index.md", "scope": ["src/**"],
      "when": "before locating architecture or contracts",
      "authority": "knowledge-map"
    }]
  }
}
```

Both keys above belong inside governance. Sources require id, path, a nonempty
scope array of repository globs, and a nonempty when condition; authority is
optional. Doctor rejects duplicate source ids and duplicate authority names.
Use distinct authority names for distinct facts; this is a project-wide unique
declaration, not automatic semantic conflict detection or a scoped override.

Entrypoint and source paths must be files inside the repository, including
after resolving symlinks. Each scope glob must match a tracked file. Without
a Git inventory scopes cannot be verified and doctor fails. Every source must
be reachable from the entrypoint through Markdown links in declared sources;
undeclared intermediate documents are not crawled. Declare each navigation
hop. Links to declared destinations must resolve their anchors. Relative links
use normal file paths (percent-encode spaces); directory/index aliases and
reference-style Markdown links are not routing edges in this first contract.

The entrypoint must have a governance.docs maxBytes budget. Additional maps can
have their own budgets there. maxBytes counts UTF-8 bytes; maxWords retains its
existing whitespace semantics for compatibility. Neither is a tokenizer or an
exact token estimate. Declaring sources does not automatically load them.

Doctor enforces these structural facts; existing doctor gate/proof mechanisms
apply. Path existence cannot establish document correctness. Evaluate future
routing changes using task success, missed-context rework, reading cost and
human corrections together. No task-level token savings have yet been measured.
