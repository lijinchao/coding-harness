import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { toolVersion } from '../src/tool.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function manifestPath(dir) {
  return join(dir, 'harness.manifest.json')
}

function gate(overrides) {
  return { id: 'g', command: 'harness check', protects: 'p', prove_fires: 'f', severity: 'blocking', ...overrides }
}

function makeConsumer(root, name) {
  const base = join(root, 'base')
  const consumer = join(root, name)
  mkdirSync(base, { recursive: true })
  mkdirSync(consumer, { recursive: true })
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n\nShared.\n')
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', '0.1.0'])
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath(consumer), JSON.stringify({
    version: '0.1.0',
    tool: { version: toolVersion() },
    base: { source: '../dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [gate()],
  }, null, 2) + '\n')
  return consumer
}

test('scan passes when every consumer is clean', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-scan-'))
  const a = makeConsumer(root, 'a')
  run(['sync', '--manifest', manifestPath(a)])
  run(['scan', '--root', root])
  rmSync(root, { recursive: true, force: true })
})

test('scan fails when a consumer has diverged', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-scan-'))
  const a = makeConsumer(root, 'a')
  const b = makeConsumer(root, 'b')
  run(['sync', '--manifest', manifestPath(a)])
  run(['sync', '--manifest', manifestPath(b)])
  writeFileSync(join(b, 'AGENTS.md'), '# tampered\n')
  assert.throws(() => run(['scan', '--root', root]))
  rmSync(root, { recursive: true, force: true })
})

test('prove passes a gate that fires and is reverted', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-'))
  writeFileSync(join(root, 'marker.txt'), 'x\n')
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath(root), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({ id: 'good', command: 'test -f marker.txt', prove_fires_command: 'rm -f marker.txt', revert_command: 'touch marker.txt' })],
  }, null, 2) + '\n')
  run(['prove', '--manifest', manifestPath(root), '--gate', 'good'])
  rmSync(root, { recursive: true, force: true })
})

test('prove fails a gate whose action no longer fires', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-'))
  writeFileSync(join(root, 'marker.txt'), 'x\n')
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath(root), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({ id: 'dead', command: 'test -f marker.txt', prove_fires_command: 'true', revert_command: 'true' })],
  }, null, 2) + '\n')
  assert.throws(() => run(['prove', '--manifest', manifestPath(root), '--gate', 'dead']))
  rmSync(root, { recursive: true, force: true })
})
