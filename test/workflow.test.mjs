import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WORKFLOW } from '../src/workflow.mjs'
import { toolRoot } from '../src/tool.mjs'

test('the repository runs the workflow the tool generates', () => {
  const committed = readFileSync(resolve(toolRoot(), '.github/workflows/harness.yml'), 'utf8')
  assert.equal(committed, WORKFLOW)
})
