import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { adoptionProblems } from '../src/adopt.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')
function run(args) { return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }) }

const REQ = { requiredGates: ['harness-drift', 'doctor'], requiredGovernance: ['owners'], recommendedGovernance: ['version'] }

test('adoption reports missing required gates and governance', () => {
  const gap = adoptionProblems({ gates: [{ id: 'harness-drift' }] }, REQ)
  assert.ok(gap.problems.some((problem) => problem.includes('doctor')))
  assert.ok(gap.problems.some((problem) => problem.includes('owners')))
  assert.ok(gap.warnings.some((warning) => warning.includes('version')))
})

test('adoption is silent without requirements or when adopted', () => {
  assert.deepEqual(adoptionProblems({ gates: [] }, undefined), { problems: [], warnings: [] })
  const gap = adoptionProblems({ gates: [{ id: 'harness-drift' }, { id: 'doctor' }], governance: { owners: ['@x'], decisions: 'docs/decisions' } }, REQ)
  assert.deepEqual(gap.problems, [])
})

test('adoption warns about a missing recommended phase and fails a required one', () => {
  const manifest = { gates: [{ id: 'g', phase: 'fast' }] }
  const recommended = adoptionProblems(manifest, { recommendedPhases: ['release'] })
  assert.deepEqual(recommended.problems, [])
  assert.ok(recommended.warnings.some((warning) => warning.includes('release')))
  const required = adoptionProblems(manifest, { requiredPhases: ['release'] })
  assert.ok(required.problems.some((problem) => problem.includes('release')))
  const adopted = adoptionProblems({ gates: [{ id: 'g', phase: 'release' }] }, { requiredPhases: ['release'] })
  assert.deepEqual(adopted.problems, [])
})

test('check fails when the consumer has not adopted the base requirements', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-adopt-'))
  const base = join(root, 'base')
  mkdirSync(base)
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n')
  writeFileSync(join(base, 'requirements.json'), JSON.stringify({ requiredGates: ['harness-drift', 'doctor'], requiredGovernance: ['owners'] }) + '\n')
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', '1.0.0', '--force'])
  const consumer = join(root, 'consumer')
  mkdirSync(consumer)
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(join(consumer, 'harness.manifest.json'), JSON.stringify({
    version: '1.0.0',
    base: { source: '../dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [{ id: 'harness-drift', command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'true', revert_command: 'true', severity: 'blocking' }],
  }, null, 2) + '\n')
  run(['sync', '--manifest', join(consumer, 'harness.manifest.json')])
  assert.throws(() => run(['check', '--manifest', join(consumer, 'harness.manifest.json')]))
  rmSync(root, { recursive: true, force: true })
})
