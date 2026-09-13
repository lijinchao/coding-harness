import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { validateManifest } from '../src/manifest.mjs'
import { proveGate } from '../src/prove.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

test('validate rejects unknown fields and duplicate gate ids', () => {
  const unknown = validateManifest({ version: '1', extra: true, compositions: [{ output: 'a', sources: ['b'] }], skills: [], gates: [] })
  assert.ok(unknown.some((error) => error.includes('unknown field')))
  const gates = [{ id: 'x', command: 'c', protects: 'p', prove_fires: 'f', severity: 'advisory' }]
  const dup = validateManifest({ version: '1', compositions: [{ output: 'a', sources: ['b'] }], skills: [], gates: [gates[0], gates[0]] })
  assert.ok(dup.some((error) => error.includes('duplicate id')))
})

test('validate requires a blocking gate to carry an executable proof', () => {
  const errors = validateManifest({ version: '1', compositions: [{ output: 'a', sources: ['b'] }], skills: [], gates: [{ id: 'x', command: 'c', protects: 'p', prove_fires: 'f', severity: 'blocking' }] })
  assert.ok(errors.some((error) => error.includes('prove_fires_command')))
  assert.ok(errors.some((error) => error.includes('revert_command')))
})

test('proveGate errors rather than silently skipping a blocking gate', async () => {
  const result = await proveGate('.', { id: 'x', command: 'true', protects: 'p', prove_fires: 'f', severity: 'blocking' })
  assert.equal(result.status, 'error')
})

test('prove fails for an unknown gate id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-prove-'))
  writeFileSync(join(dir, 'AGENTS.delta.md'), '# D\n')
  writeFileSync(join(dir, 'harness.manifest.json'), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [{ id: 'g', command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'true', revert_command: 'true', severity: 'blocking' }],
  }, null, 2) + '\n')
  assert.throws(() => run(['prove', '--manifest', join(dir, 'harness.manifest.json'), '--gate', 'nope']))
  rmSync(dir, { recursive: true, force: true })
})

test('release refuses to overwrite unless --force is passed', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-release-'))
  mkdirSync(join(root, 'base'))
  writeFileSync(join(root, 'base', 'AGENTS.base.md'), '# B\n')
  run(['release', '--base', join(root, 'base'), '--out', join(root, 'dist'), '--version', '1.0.0'])
  assert.throws(() => run(['release', '--base', join(root, 'base'), '--out', join(root, 'dist'), '--version', '1.0.0']))
  run(['release', '--base', join(root, 'base'), '--out', join(root, 'dist'), '--version', '1.0.0', '--force'])
  assert.ok(existsSync(join(root, 'dist', 'base@1.0.0', 'release.json')))
  rmSync(root, { recursive: true, force: true })
})
