import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { validateManifest } from '../src/manifest.mjs'
import { composeText } from '../src/compose.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function manifestPath(dir) {
  return join(dir, 'harness.manifest.json')
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-'))
  writeFileSync(join(dir, 'AGENTS.base.md'), '# Base\n\nShared rules.\n')
  writeFileSync(join(dir, 'AGENTS.delta.md'), '# Delta\n\nLocal rules.\n')
  writeFileSync(manifestPath(dir), `${JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [{
      id: 'drift',
      command: 'harness check',
      protects: 'composition',
      prove_fires: 'edit AGENTS.md',
      severity: 'blocking',
    }],
  }, null, 2)}\n`)
  return dir
}

test('validate accepts a well-formed manifest', () => {
  const errors = validateManifest({
    version: '1',
    compositions: [{ output: 'a', sources: ['b'] }],
    skills: [],
    gates: [],
  })
  assert.deepEqual(errors, [])
})

test('validate rejects a gate without prove_fires', () => {
  const errors = validateManifest({
    version: '1',
    compositions: [{ output: 'a', sources: ['b'] }],
    skills: [],
    gates: [{ id: 'x', command: 'c', protects: 'p', severity: 'blocking' }],
  })
  assert.ok(errors.some((error) => error.includes('prove_fires')))
})

test('compose joins sources in declaration order', () => {
  const dir = makeRepo()
  assert.equal(composeText(dir, ['AGENTS.base.md', 'AGENTS.delta.md']), '# Base\n\nShared rules.\n\n# Delta\n\nLocal rules.\n')
  rmSync(dir, { recursive: true, force: true })
})

test('sync composes the output, and check passes until the output drifts', () => {
  const dir = makeRepo()
  run(['sync', '--manifest', manifestPath(dir)])
  assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /Shared rules/)
  run(['check', '--manifest', manifestPath(dir)])
  writeFileSync(join(dir, 'AGENTS.md'), '# tampered\n')
  assert.throws(() => run(['check', '--manifest', manifestPath(dir)]))
  rmSync(dir, { recursive: true, force: true })
})

test('init scaffolds a delta and a manifest', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-init-'))
  run(['init', '--dir', dir])
  assert.match(readFileSync(join(dir, 'AGENTS.delta.md'), 'utf8'), /Repository delta/)
  run(['validate', '--manifest', manifestPath(dir)])
  rmSync(dir, { recursive: true, force: true })
})
