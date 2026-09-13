import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { doctorProblems, doctorReport } from '../src/doctor.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function manifest(governance, product) {
  return { version: '1.2.3', governance, product, gates: [], lock: {} }
}

test('doctor passes when declared facts are consistent', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-'))
  writeFileSync(join(root, 'VERSION'), '2.0.0\n')
  writeFileSync(join(root, 'README.md'), 'Status: 2.0.0\n')
  mkdirSync(join(root, 'docs', 'decisions'), { recursive: true })
  writeFileSync(join(root, 'docs', 'decisions', '0001.md'), 'Status: implemented\n\n## Problem\n## Decision\n## Alternatives\n## Consequences\n')
  writeFileSync(join(root, 'CODEOWNERS'), '* @owner\n')
  assert.deepEqual(doctorProblems(root, manifest({ decisions: 'docs/decisions', owners: ['@owner'] }, { version: { path: 'VERSION' }, mentions: ['README.md'] })), [])
  rmSync(root, { recursive: true, force: true })
})

test('doctor reports a product mention that disagrees with the version source', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-'))
  writeFileSync(join(root, 'VERSION'), '2.0.0\n')
  writeFileSync(join(root, 'README.md'), 'Status: 1.0.0\n')
  const problems = doctorProblems(root, manifest({}, { version: { path: 'VERSION' }, mentions: ['README.md'] }))
  assert.ok(problems.some((problem) => problem.includes('does not mention the product version 2.0.0')))
  rmSync(root, { recursive: true, force: true })
})

test('doctor reports a decision record missing a section and a missing owner route', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-'))
  mkdirSync(join(root, 'docs', 'decisions'), { recursive: true })
  writeFileSync(join(root, 'docs', 'decisions', '0001.md'), '## Problem\n## Decision\n')
  const problems = doctorProblems(root, manifest({ decisions: 'docs/decisions', owners: ['@owner'] }))
  assert.ok(problems.some((problem) => problem.includes('## Alternatives')))
  assert.ok(problems.some((problem) => problem.includes('CODEOWNERS')))
  rmSync(root, { recursive: true, force: true })
})

test('doctor requires the declared CI file to run every required command', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-'))
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
  writeFileSync(join(root, '.github', 'workflows', 'harness.yml'), 'run: ./harness gates --manifest harness.manifest.json\n')
  const requirements = { requiredCiCommands: ['harness gates', 'harness prove'] }
  const problems = doctorProblems(root, manifest({ ci: ['.github/workflows/harness.yml'] }), requirements)
  assert.ok(problems.some((problem) => problem.includes('harness prove')))
  rmSync(root, { recursive: true, force: true })
})

test('doctor accepts a CI file that runs every required command', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-'))
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
  writeFileSync(join(root, '.github', 'workflows', 'harness.yml'), 'run: ./harness gates --manifest harness.manifest.json\nrun: ./harness prove --manifest harness.manifest.json\n')
  const requirements = { requiredCiCommands: ['harness gates', 'harness prove'] }
  assert.deepEqual(doctorProblems(root, manifest({ ci: ['.github/workflows/harness.yml'] }), requirements), [])
  rmSync(root, { recursive: true, force: true })
})

test('doctor reports an incomplete change record and a missing manual-verification path', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-'))
  mkdirSync(join(root, 'docs', 'changes'), { recursive: true })
  writeFileSync(join(root, 'docs', 'changes', '0001-x.md'), '## Problem\n## Approach\n')
  const problems = doctorProblems(root, manifest({ changes: 'docs/changes', manualVerification: 'docs/validation' }))
  assert.ok(problems.some((problem) => problem.includes('## Verification')))
  assert.ok(problems.some((problem) => problem.includes('manual verification path not found')))
  rmSync(root, { recursive: true, force: true })
})

test('doctor warns about a missing recommended governance key without failing', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-'))
  const { problems, warnings } = doctorReport(root, manifest({}), { recommendedGovernance: ['manualVerification'] })
  assert.deepEqual(problems, [])
  assert.ok(warnings.some((warning) => warning.includes('manualVerification')))
  rmSync(root, { recursive: true, force: true })
})

test('--strict turns a recommended gap into a failure', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-strict-'))
  const base = join(root, 'base')
  mkdirSync(base, { recursive: true })
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n')
  writeFileSync(join(base, 'requirements.json'), JSON.stringify({ recommendedGovernance: ['decisions'] }) + '\n')
  execFileSync(process.execPath, [CLI, 'release', '--base', base, '--out', join(root, 'dist'), '--version', '0.1.0'], { encoding: 'utf8' })
  const manifestPath = join(root, 'harness.manifest.json')
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath, JSON.stringify({
    version: '0.1.0',
    base: { source: 'dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [{ id: 'g', command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'false', revert_command: 'true', severity: 'blocking' }],
  }, null, 2) + '\n')
  const run = (extra) => execFileSync(process.execPath, [CLI, 'doctor', '--manifest', manifestPath, ...extra], { encoding: 'utf8' })
  assert.match(run([]), /doctor: warning: missing recommended governance: decisions/)
  assert.throws(() => run(['--strict']))
  rmSync(root, { recursive: true, force: true })
})
