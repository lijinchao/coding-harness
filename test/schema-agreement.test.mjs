import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as contract from '../src/manifest.mjs'

const schema = JSON.parse(readFileSync(resolve(import.meta.dirname, '../schema/harness.manifest.schema.json'), 'utf8'))
const items = schema.properties

const KEY_GROUPS = [
  ['ROOT_KEYS', items],
  ['TOOL_KEYS', items.tool.properties],
  ['BASE_KEYS', items.base.properties],
  ['GOVERNANCE_KEYS', items.governance.properties],
  ['COMPOSITION_KEYS', items.compositions.items.properties],
  ['SKILL_KEYS', items.skills.items.properties],
  ['GATE_KEYS', items.gates.items.properties],
  ['EXPECT_KEYS', items.gates.items.properties.expect.properties],
  ['LOCK_KEYS', items.lock.properties],
  ['LOCK_TOOL_KEYS', items.lock.properties.tool.properties],
  ['LOCK_BASE_KEYS', items.lock.properties.base.properties],
]

for (const [name, properties] of KEY_GROUPS) {
  test('the schema and the validator agree on ' + name, () => {
    assert.deepEqual([...contract[name]].sort(), Object.keys(properties).sort())
  })
}

test('the schema and the validator agree on the required fields', () => {
  assert.deepEqual([...contract.SKILL_FIELDS].sort(), [...items.skills.items.required].sort())
  assert.deepEqual([...contract.GATE_FIELDS].sort(), [...items.gates.items.required].sort())
  for (const field of contract.SKILL_FIELDS) assert.ok(items.skills.items.properties[field] !== undefined)
  for (const field of contract.GATE_FIELDS) assert.ok(items.gates.items.properties[field] !== undefined)
})
