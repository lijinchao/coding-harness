import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateManifest } from '../src/manifest.mjs'

function manifest(legibility) {
  return {
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [{ id: 'g', command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'false', revert_command: 'true', severity: 'blocking' }],
    governance: { legibility },
  }
}

test('a complete legibility declaration is valid', () => {
  assert.deepEqual(validateManifest(manifest({
    start: { command: 'make up' },
    ready: { command: 'curl -sf localhost:3000/health' },
    'observe.ui': { command: 'make shot', evidence: 'artifacts/ui' },
    teardown: { command: 'make down' },
  })), [])
})

test('an unknown adapter is rejected', () => {
  const errors = validateManifest(manifest({ open: { command: 'true' } }))
  assert.match(errors.join('\n'), /governance\.legibility\.open: unknown field/)
})

test('a multi-line command and an escaping evidence path are rejected', () => {
  const errors = validateManifest(manifest({
    start: { command: 'make up\nmake more' },
    ready: { command: 'true' },
    'observe.logs': { command: 'true', evidence: '../elsewhere' },
  }))
  assert.match(errors.join('\n'), /required single line/)
  assert.match(errors.join('\n'), /must stay inside the repository/)
})

test('start and ready must be declared together, and teardown needs start', () => {
  assert.match(validateManifest(manifest({ start: { command: 'true' } })).join('\n'), /start requires ready/)
  assert.match(validateManifest(manifest({ ready: { command: 'true' } })).join('\n'), /ready requires start/)
  assert.match(validateManifest(manifest({ teardown: { command: 'true' } })).join('\n'), /teardown requires start/)
})
