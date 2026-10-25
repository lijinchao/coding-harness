import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { documentProblems, surfaceCoverageProblems } from '../src/documents.mjs'
import { doctorProblems } from '../src/doctor.mjs'
import { validateManifest } from '../src/manifest.mjs'
import { matchGlob } from '../src/select.mjs'

const cli = resolve(import.meta.dirname, '../bin/harness.mjs')
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'harness-context-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' })
  git('init', '-q')
  git('config', 'core.quotepath', 'true')
  writeFileSync(join(root, 'AGENTS.md'), '# Entry\n[map](地图.md)\n')
  writeFileSync(join(root, '地图.md'), '# 地图\n[status](状态.md)\n')
  writeFileSync(join(root, '状态.md'), '# 状态\n')
  git('add', '.')
  git('-c', 'user.name=test', '-c', 'user.email=t@t', 'commit', '-qm', 'initial')
  const manifest = { version: '1', compositions: [{ output: 'OUT.md', sources: ['AGENTS.md'] }], skills: [], gates: [], governance: {
    docs: [{ path: 'AGENTS.md', maxBytes: 256 }],
    context: { entrypoint: 'AGENTS.md', sources: [
      { id: 'map', path: '地图.md', scope: ['**'], when: 'before locating a source' },
      { id: 'status', path: '状态.md', scope: ['状态.md'], when: 'before planning', authority: 'current-status' },
    ] },
  } }
  return { root, git, manifest }
}

test('byte budgets count Chinese content without pretending to count tokens', t => {
  const { root } = fixture(t)
  writeFileSync(join(root, '状态.md'), '中文'.repeat(10))
  assert.match(documentProblems(root, [{ path: '状态.md', maxBytes: 59 }]).join(), /60 bytes exceeds/)
  assert.deepEqual(documentProblems(root, [{ path: '状态.md', maxBytes: 60 }]), [])
})

test('Git coverage and changed selection preserve Unicode, spaces and newline filenames', t => {
  const { root, git } = fixture(t)
  const names = ['中文 空格.md', 'line\nbreak.md']
  for (const name of names) assert.equal(matchGlob(name, '**'), true)
  for (const name of names) writeFileSync(join(root, name), '# new\n')
  git('add', '.')
  git('-c', 'user.name=test', '-c', 'user.email=t@t', 'commit', '-qm', 'paths')
  assert.deepEqual(surfaceCoverageProblems(root, [{ paths: ['*.md'] }]), [])
  const manifest = { version: '1', compositions: [{ output: 'OUT.md', sources: ['AGENTS.md'] }], skills: [], gates: [
    { id: 'paths', command: 'true', protects: 'paths', prove_fires: 'unused', severity: 'advisory' },
  ], surfaces: [{ id: 'docs', paths: ['*.md'], requires: ['paths'] }] }
  const path = join(root, 'harness.manifest.json')
  writeFileSync(path, JSON.stringify(manifest))
  const output = execFileSync(process.execPath, [cli, 'select', '--manifest', path, '--since', 'HEAD~1'], { encoding: 'utf8' })
  assert.match(output, /paths/)
})

test('context is optional and validates native map declarations', t => {
  const { root, manifest } = fixture(t)
  assert.deepEqual(validateManifest(manifest), [])
  assert.deepEqual(doctorProblems(root, manifest), [])
  delete manifest.governance.context
  assert.deepEqual(validateManifest(manifest), [])
})

test('context rejects malformed declarations rather than silently dropping fields', t => {
  const { manifest } = fixture(t)
  for (const field of ['id', 'path', 'scope', 'when']) {
    const copy = structuredClone(manifest)
    delete copy.governance.context.sources[0][field]
    assert.ok(validateManifest(copy).some(x => x.includes(field)), field)
  }
  for (const change of [
    m => { m.governance.context.sources[0].scope = [] },
    m => { m.governance.context.sources[0].when = '' },
    m => { m.governance.context.sources[0].typo = true },
    m => { m.governance.docs[0].maxBytes = 0 },
    m => { m.governance.docs[0].maxBytes = 1.5 },
  ]) {
    const copy = structuredClone(manifest); change(copy)
    assert.notDeepEqual(validateManifest(copy), [])
  }
})

test('doctor rejects broken, ambiguous, unreachable and escaping context declarations', t => {
  const { root, manifest } = fixture(t)
  const cases = [
    [m => { m.governance.context.sources[0].path = 'missing.md' }, /not found/],
    [m => { m.governance.context.sources[1].id = 'map' }, /duplicate id/],
    [m => { m.governance.context.sources[0].authority = 'current-status' }, /duplicate authority/],
    [m => { m.governance.context.sources[0].scope = ['missing/**'] }, /scope.*matches no tracked/],
    [m => { m.governance.context.sources[0].scope = ['../*'] }, /scope.*inside/],
    [m => { m.governance.context.sources[0].path = '../outside.md' }, /inside/],
    [m => { delete m.governance.docs[0].maxBytes }, /entrypoint.*maxBytes/],
    [m => { m.governance.context.entrypoint = '地图.md' }, /entrypoint.*maxBytes/],
  ]
  for (const [change, pattern] of cases) {
    const copy = structuredClone(manifest); change(copy)
    assert.match(doctorProblems(root, copy).join('\n'), pattern)
  }
  writeFileSync(join(root, '地图.md'), '# detached\n')
  assert.match(doctorProblems(root, manifest).join(), /unreachable.*状态.md/)
})

test('doctor checks real paths to prevent a symlink leaving the repository', t => {
  const { root, manifest } = fixture(t)
  symlinkSync(join(root, '..'), join(root, 'outside'))
  manifest.governance.context.sources[0].path = 'outside'
  assert.match(doctorProblems(root, manifest).join(), /inside/)
})

test('a broken anchor in a declared routing edge is not considered reachable', t => {
  const { root, manifest } = fixture(t)
  writeFileSync(join(root, '地图.md'), '# map\n[status](状态.md#missing)\n')
  assert.match(doctorProblems(root, manifest).join(), /anchor not found/)
})
