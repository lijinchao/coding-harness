# Discover foreign Harness integrations

## Problem

The Deep Research repository carries `.coding-harness/project.json` and a
generated Coding Harness Skill, but it does not carry this project's
`harness.manifest.json` or repository-local `./harness` bootstrap. Its Skill
expects a globally resolvable `coding-harness` executable. When that executable
is absent, an agent can only report that receipts are unavailable, while this
project's survey currently collapses the repository into the ordinary
`not-adopted` case and loses the incompatible integration evidence.

## Approach

1. Extend read-only survey with a conservative inventory of known foreign
   Harness markers. Do not parse arbitrary untracked content or execute the
   foreign runtime.
2. Report a distinct `foreign-integration-detected` status, the marker paths,
   declared foreign version when safely readable, expected executable, and
   whether that executable is resolvable.
3. Keep readiness false and qualification unavailable. Direct the operator to
   restore the matching runtime or review migration; never imply that this
   project's CLI can consume the foreign manifest.
4. Document that this project's consumers use the repository-local pinned
   `./harness` bootstrap. Leave correction of a foreign generated Skill to its
   owning KIT release; copying that Skill into this base would not repair its
   consumers.
5. Cover marker detection, missing and available foreign runtime, untracked
   marker rejection, ordinary unadopted repositories, and the no-execution
   boundary with isolated tests.

## Verification

- `node --test test/survey.test.mjs`
- `npm test`
- `node bin/harness.mjs doctor --manifest harness.manifest.json`
- `./harness check --manifest examples/consumer/harness.manifest.json`
- Read-only survey of `/Users/qihoo/pyworkspace/deep-research-agent`
