import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function manifestPath(dir) {
  return join(dir, 'harness.manifest.json')
}

function gate(id, command, severity) {
  return { id, command, protects: 'p', prove_fires: 'f', severity, prove_fires_command: 'true', revert_command: 'true' }
}

function writeManifest(dir, gates) {
  writeFileSync(join(dir, 'AGENTS.delta.md'), '# D\n')
  writeFileSync(manifestPath(dir), JSON.stringify({ version: '0.1.0', compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }], skills: [], gates }, null, 2) + '\n')
}

test('gates fails when a blocking gate fails', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-gates-'))
  writeManifest(dir, [gate('pass', 'true', 'blocking'), gate('fail', 'false', 'blocking')])
  assert.throws(() => run(['gates', '--manifest', manifestPath(dir)]))
  rmSync(dir, { recursive: true, force: true })
})

test('gates tolerates an advisory failure', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-gates-'))
  writeManifest(dir, [gate('pass', 'true', 'blocking'), gate('warn', 'false', 'advisory')])
  run(['gates', '--manifest', manifestPath(dir)])
  rmSync(dir, { recursive: true, force: true })
})

test('upgrade rewrites a stale base version in gate text', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-upgrade-'))
  const base = join(dir, 'base')
  mkdirSync(base)
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n')
  writeManifest(dir, [{ id: 'drift', command: 'true', protects: 'match base@0.1.0 plus delta', prove_fires: 'edit base@0.1.0', severity: 'blocking', prove_fires_command: 'true', revert_command: 'true' }])
  run(['release', '--base', base, '--out', join(dir, 'dist'), '--version', '0.2.0', '--force'])
  const m = JSON.parse(readFileSync(manifestPath(dir), 'utf8'))
  m.base = { source: './dist' }
  m.compositions = [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }]
  writeFileSync(manifestPath(dir), JSON.stringify(m, null, 2) + '\n')
  run(['upgrade', '--manifest', manifestPath(dir), '--to', '0.2.0'])
  const after = JSON.parse(readFileSync(manifestPath(dir), 'utf8'))
  assert.ok(after.gates[0].protects.includes('base@0.2.0'))
  assert.ok(!after.gates[0].protects.includes('base@0.1.0'))
  assert.ok(after.gates[0].prove_fires.includes('base@0.2.0'))
  rmSync(dir, { recursive: true, force: true })
})

test('gates fails for an unknown gate id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-gates-'))
  writeManifest(dir, [gate('pass', 'true', 'blocking')])
  assert.throws(() => run(['gates', '--manifest', manifestPath(dir), '--gate', 'nope']))
  rmSync(dir, { recursive: true, force: true })
})

test('gates fails when a phase selects no gate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-gates-'))
  writeManifest(dir, [{ ...gate('full', 'true', 'blocking'), phase: 'full' }])
  assert.throws(() => run(['gates', '--manifest', manifestPath(dir), '--phase', 'fast']))
  rmSync(dir, { recursive: true, force: true })
})

test('a timed-out gate has its whole process tree killed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-tree-'))
  const marker = join(dir, 'late.txt')
  writeManifest(dir, [gate('slow', `( sleep 2; printf late > '${marker}' ) & sleep 30`, 'blocking')])
  assert.throws(() => run(['gates', '--manifest', manifestPath(dir), '--timeout', '1']))
  execFileSync('sleep', ['3'])
  assert.ok(!existsSync(marker), 'the background child should not survive the timeout')
  rmSync(dir, { recursive: true, force: true })
})

test('gates --changed runs only the gates a change selects', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-changed-'))
  const marker = join(dir, 'ran.txt')
  const mark = (name) => `printf '${name}\\n' >> '${marker}'`
  writeManifest(dir, [gate('always', mark('always'), 'blocking'), gate('tool', mark('tool'), 'blocking'), gate('engine', mark('engine'), 'blocking')])
  const m = JSON.parse(readFileSync(manifestPath(dir), 'utf8'))
  m.gates[0].always = true
  m.surfaces = [
    { id: 'tool', paths: ['src/**'], requires: ['tool'] },
    { id: 'engine', paths: ['levels/**'], requires: ['engine'] },
  ]
  writeFileSync(manifestPath(dir), JSON.stringify(m, null, 2) + '\n')
  run(['gates', '--manifest', manifestPath(dir), '--changed', 'src/a.mjs'])
  const ran = readFileSync(marker, 'utf8')
  assert.ok(ran.includes('always'))
  assert.ok(ran.includes('tool'))
  assert.ok(!ran.includes('engine'))
  rmSync(dir, { recursive: true, force: true })
})

test('upgrade rewrites the declared version-reference files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-upgrade-'))
  const base = join(dir, 'base')
  mkdirSync(base)
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n')
  writeFileSync(join(dir, 'README.md'), 'Status: v0.1.0\n')
  writeManifest(dir, [{ id: 'drift', command: 'true', protects: 'match base@0.1.0 plus delta', prove_fires: 'edit base@0.1.0', severity: 'blocking', prove_fires_command: 'true', revert_command: 'true' }])
  run(['release', '--base', base, '--out', join(dir, 'dist'), '--version', '0.2.0', '--force'])
  const m = JSON.parse(readFileSync(manifestPath(dir), 'utf8'))
  m.base = { source: './dist' }
  m.governance = { version: ['README.md'] }
  m.compositions = [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }]
  writeFileSync(manifestPath(dir), JSON.stringify(m, null, 2) + '\n')
  run(['upgrade', '--manifest', manifestPath(dir), '--to', '0.2.0'])
  assert.ok(readFileSync(join(dir, 'README.md'), 'utf8').includes('v0.2.0'))
  rmSync(dir, { recursive: true, force: true })
})

test('gates --phase runs the unphased gates plus that phase only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-phase-'))
  const mark = (name) => `printf '${name}\\n' >> '${join(dir, 'ran.txt')}'`
  writeManifest(dir, [
    gate('always', mark('always'), 'blocking'),
    { ...gate('fast', mark('fast'), 'blocking'), phase: 'fast' },
    { ...gate('full', mark('full'), 'blocking'), phase: 'full' },
  ])
  run(['gates', '--manifest', manifestPath(dir), '--phase', 'fast'])
  const ran = readFileSync(join(dir, 'ran.txt'), 'utf8')
  assert.ok(ran.includes('always'))
  assert.ok(ran.includes('fast'))
  assert.ok(!ran.includes('full'))
  rmSync(dir, { recursive: true, force: true })
})
