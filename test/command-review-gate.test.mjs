import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runGates } from '../src/gates.mjs'

test('the self command-review gate runs twice without leftover receipt collisions', async () => {
  const root = resolve(import.meta.dirname, '..')
  const manifest = JSON.parse(readFileSync(resolve(root, 'harness.manifest.json'), 'utf8'))
  const gate = manifest.gates.find(gate => gate.id === 'command-review')
  for (let i = 0; i < 2; i++) {
    const [result] = await runGates(root, [gate])
    assert.equal(result.ok, true, 'run ' + (i + 1) + ': ' + result.output)
  }
})
