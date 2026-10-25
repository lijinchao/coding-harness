import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

test('recording pack proofs and upgrading preserve the raw repository declarations', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'pack-proof-record-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cli = resolve(import.meta.dirname, '../bin/harness.mjs')
  const run = (...args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  const base = join(root, 'base'); const pack = join(root, 'pack'); const consumer = join(root, 'consumer')
  for (const path of [base, pack, consumer]) mkdirSync(path)
  writeFileSync(join(base, 'AGENTS.base.md'), '# Shared\n')
  for (const version of ['0.1.41', '0.1.42']) run('release', '--base', base, '--out', join(root, 'bases'), '--version', version)
  const gate = { id: 'sample/guard', command: 'test ! -f violated', protects: 'no violation', severity: 'blocking', prove_fires: 'create violated', prove_fires_command: ': > violated', revert_command: 'rm violated', expect: { forbid: ['ERROR:'] }, always: true }
  writeFileSync(join(pack, 'pack.json'), JSON.stringify({ id: 'sample', gates: [gate], skills: [], surfaces: [] }))
  run('release', '--base', pack, '--out', join(root, 'packs'), '--version', '0.1.0')
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Local\n')
  const path = join(consumer, 'harness.manifest.json')
  writeFileSync(path, JSON.stringify({ version: '0.1.41', base: { source: join(root, 'bases') }, compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }], skills: [], gates: [], packs: [{ id: 'sample', source: join(root, 'packs'), version: '0.1.0' }] }))
  run('sync', '--manifest', path)
  const git = (...args) => execFileSync('git', ['-C', consumer, ...args], { stdio: 'pipe' })
  const commit = () => { git('add', '-A'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'record') }
  git('init', '-q'); commit()
  run('prove', '--manifest', path, '--record', '--timeout', '10')
  const recorded = JSON.parse(readFileSync(path, 'utf8'))
  assert.deepEqual(recorded.gates, [], 'pack gates must never become repository declarations')
  assert.equal(recorded.surfaces, undefined)
  assert.ok(recorded.lock.proofs['sample/guard'])
  commit()
  run('validate', '--manifest', path)
  run('prove', '--manifest', path, '--timeout', '10')
  run('upgrade', '--manifest', path, '--to', '0.1.42')
  const upgraded = JSON.parse(readFileSync(path, 'utf8'))
  assert.equal(upgraded.version, '0.1.42', 'upgrade must persist the raw root version as well as the merged lock')
  assert.deepEqual(upgraded.gates, [])
  assert.ok(upgraded.lock.proofs['sample/guard'])
  run('check', '--manifest', path)
})
