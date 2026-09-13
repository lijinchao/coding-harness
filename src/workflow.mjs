/**
 * The CI workflow `init` writes, and the one this repository runs.
 *
 * Keeping them one string means the generated workflow cannot drift from the
 * workflow the tool itself uses; `test/workflow.test.mjs` holds them together.
 */
export const WORKFLOW = `name: harness

on:
  push:
    branches: [main]
  pull_request:

jobs:
  harness:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: actions/setup-node@v5
        with:
          node-version: '22'
      - name: Run every declared gate
        run: ./harness gates --manifest harness.manifest.json --report .harness/gates.jsonl
      - name: Report the first-pass rate
        if: always()
        run: ./harness metrics --log .harness/gates.jsonl
      - name: Prove every gate still fires
        run: ./harness prove --manifest harness.manifest.json --timeout 300
      - name: Archive the gate report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: gate-report
          path: .harness/gates.jsonl
`
