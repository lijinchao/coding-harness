import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { adoptionProblems } from '../src/adopt.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')
function run(args) { return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }) }

function repo(gate) {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-out-'))
  writeFileSync(join(dir, 'AGENTS.delta.md'), '# D\n')
  writeFileSync(join(dir, 'harness.manifest.json'), JSON.stringify({
    version: '1.0.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate],
  }, null, 2) + '\n')
  return dir
}
function gate(extra) {
  return { id: 'g', command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'true', revert_command: 'true', severity: 'blocking', ...extra }
}

test('a zero exit with forbidden output fails the gate', () => {
  const dir = repo(gate({ command: "printf 'SCRIPT ERROR: boom\\n'", expect: { forbid: ['SCRIPT ERROR:', 'ERROR:'] } }))
  assert.throws(() => run(['gates', '--manifest', join(dir, 'harness.manifest.json')]))
  rmSync(dir, { recursive: true, force: true })
})

test('an allow-listed line passes', () => {
  const dir = repo(gate({ command: "printf 'ERROR: known benign\\n'", expect: { forbid: ['ERROR:'], allow: ['known benign'] } }))
  run(['gates', '--manifest', join(dir, 'harness.manifest.json')])
  rmSync(dir, { recursive: true, force: true })
})

test('requirements can require output assertions on blocking gates', () => {
  const missing = adoptionProblems({ gates: [{ id: 'x', severity: 'blocking' }] }, { requireOutputAssertions: true })
  assert.ok(missing.problems.some((problem) => problem.includes('expect.forbid')))
  const present = adoptionProblems({ gates: [{ id: 'x', severity: 'blocking', expect: { forbid: ['ERROR:'] } }] }, { requireOutputAssertions: true })
  assert.deepEqual(present.problems, [])
})
