# 0019 — Document health and the instruction tree are checked

## Problem

The base governed composed files and a few governance facts, but not the documents themselves. Nothing caught a link to a renamed file, a document that grows without bound, or a nested `AGENTS.md` that an agent reads and nobody owns. In a growing repository the first drift is documents disagreeing with each other, not code drift.

## Decision

`governance.docs` declares the documents under check: each must exist, its relative Markdown links must resolve (a fragment must name a heading in the target file), and it must stay within its optional `maxWords` budget. `governance.instructions` declares globs for every instruction file an agent can read; `harness doctor` walks the repository for `AGENTS.md` and `AGENTS.delta.md` and fails on an undeclared file or on a glob that matches nothing. Both keys are recommended by the base, so a repository that has not adopted them sees a warning.

## Alternatives

- Check every Markdown file: a repository may vendor or generate documents that are not its own to fix; the declared set is the repository's statement of what it writes and maintains.
- Detect duplicated statements instead of budgets: duplication detection is noisy and needs a curated ignore list before it is trustworthy; a budget is exact and forces the same relocation.
- Require the keys in the base: a small repository with one instruction file gains configuration without gaining information.

## Consequences

- A renamed file breaks a link check instead of leaving a dead link in the entry document.
- A document over budget fails until content moves to its owner instead of accumulating.
- An unmanaged nested `AGENTS.md` fails `doctor`; deciding its rules is a person's job, and the check makes the decision visible.
- Foreign links (`http:`, `https:`, `mailto:`) and links inside fenced code blocks are not checked.
