import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { doctorProblems } from '../src/doctor.mjs'
import { documentProblems, surfaceCoverageProblems } from '../src/documents.mjs'

function repo() {
  return mkdtempSync(join(tmpdir(), 'coding-harness-failclosed-'))
}

function manifest(extra) {
  return { version: '1.0.0', gates: [], lock: {}, ...extra }
}

test('a declared governance directory that is missing is a problem', () => {
  const root = repo()
  const problems = doctorProblems(root, manifest({ governance: { decisions: 'docs/decisions', postmortems: 'docs/postmortems' } }))
  assert.ok(problems.some((problem) => problem.includes('decision-record directory not found')))
  assert.ok(problems.some((problem) => problem.includes('postmortem directory not found')))
  rmSync(root, { recursive: true, force: true })
})

test('a declared document must not contain forbidden text', () => {
  const root = repo()
  writeFileSync(join(root, 'README.md'), 'pinned to coding-harness v0.1.15\n')
  const problems = documentProblems(root, [{ path: 'README.md', forbid: ['coding-harness v'] }])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /contains forbidden text/)
  writeFileSync(join(root, 'README.md'), 'the manifest owns the pin\n')
  assert.deepEqual(documentProblems(root, [{ path: 'README.md', forbid: ['coding-harness v'] }]), [])
  rmSync(root, { recursive: true, force: true })
})

test('every tracked file must be covered by a surface', () => {
  const root = repo()
  writeFileSync(join(root, 'AGENTS.md'), '# Root\n')
  writeFileSync(join(root, 'src.mjs'), '')
  const options = { cwd: root, stdio: 'pipe' }
  execFileSync('git', ['init', '-q'], options)
  execFileSync('git', ['add', '-A'], options)
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], options)
  assert.deepEqual(surfaceCoverageProblems(root, [{ id: 'instructions', paths: ['AGENTS.md'], requires: ['g'] }]), ['src.mjs: no surface covers this tracked file'])
  assert.deepEqual(surfaceCoverageProblems(root, [{ id: 'all', paths: ['**/*'], requires: ['g'] }]), [])
  rmSync(root, { recursive: true, force: true })
})
