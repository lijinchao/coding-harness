import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { doctorProblems, doctorReport } from '../src/doctor.mjs'

function manifest(governance) {
  return { version: '1.2.3', governance, gates: [], lock: {} }
}

test('doctor passes when declared facts are consistent', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-'))
  writeFileSync(join(root, 'README.md'), 'Status: v1.2.3\n')
  mkdirSync(join(root, 'docs', 'decisions'), { recursive: true })
  writeFileSync(join(root, 'docs', 'decisions', '0001.md'), '## Problem\n## Decision\n## Alternatives\n## Consequences\n')
  writeFileSync(join(root, 'CODEOWNERS'), '* @owner\n')
  assert.deepEqual(doctorProblems(root, manifest({ version: ['README.md'], decisions: 'docs/decisions', owners: ['@owner'] })), [])
  rmSync(root, { recursive: true, force: true })
})

test('doctor reports a stale version reference', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-doctor-'))
  writeFileSync(join(root, 'README.md'), 'Status: v0.0.0\n')
  const problems = doctorProblems(root, manifest({ version: ['README.md'] }))
  assert.ok(problems.some((problem) => problem.includes('v1.2.3')))
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
