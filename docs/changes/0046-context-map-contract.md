# Optional context maps and multilingual repository paths

decision: docs/decisions/0046-context-map-contract.md

## Verification

`node --test test/context-map.test.mjs` first failed for byte undercounting,
quoted Git paths, unsupported declarations and absent context checks. A separate
broken-anchor regression also failed before its implementation. Tests now
cover native map chains, scope inventory, duplicate declarations, escaping
paths and symlinks, unreachable documents, byte boundaries, and Unicode/space/
newline path selection. Schema agreement covers the new declaration keys.

Full-suite, pinned example, isolated proofs, cold consumer bootstrap and pilot
results are recorded in the subsequent context-map pilot report. No exact
token savings, semantic document correctness or automatic loading is claimed.
