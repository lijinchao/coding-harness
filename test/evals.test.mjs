import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateManifest } from '../src/manifest.mjs'

function manifest(evals, legibility) {
  return {
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [{ id: 'g', command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'false', revert_command: 'true', severity: 'blocking' }],
    governance: legibility === undefined ? undefined : { legibility },
    evals,
  }
}

const adapters = { start: { command: 'make up' }, ready: { command: 'make ready' } }
const task = { id: 'fix-reward', fixture: 'make fixture', task: 'Fix the broken reward', assert: 'make assert-reward', evidence: 'artifacts/reward.json', retries: 2 }

test('a complete eval declaration is valid', () => {
  assert.deepEqual(validateManifest(manifest([task], adapters)), [])
})

test('an eval needs an id, a fixture, a task, an assertion, and evidence', () => {
  const errors = validateManifest(manifest([{ id: 'x', task: 'do it' }], adapters))
  assert.match(errors.join('\n'), /evals\[0\]\.fixture: required non-empty string/)
  assert.match(errors.join('\n'), /evals\[0\]\.assert: required non-empty string/)
  assert.match(errors.join('\n'), /evals\[0\]\.evidence: required non-empty string/)
})

test('a multi-line command, a duplicate id, and a bad retry count are rejected', () => {
  const errors = validateManifest(manifest([
    { ...task, assert: 'make a\nmake b' },
    { ...task, retries: -1 },
  ], adapters))
  assert.match(errors.join('\n'), /required single line/)
  assert.match(errors.join('\n'), /duplicate id fix-reward/)
  assert.match(errors.join('\n'), /retries: required integer >= 0/)
})

test('evals require a legibility contract to assert against', () => {
  assert.match(validateManifest(manifest([task], undefined)).join('\n'), /requires governance\.legibility/)
})
