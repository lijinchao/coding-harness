import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { toolVersion } from '../src/tool.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function gate(id) {
  return { id, command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'true', revert_command: 'true', severity: 'blocking' }
}

test('diff reports base changes and composition impact', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-diff-'))
  for (const [version, body] of [['1.0.0', '# Base\n'], ['1.1.0', '# Base\n\nExtra.\n']]) {
    const base = join(root, 'base-' + version)
    mkdirSync(base)
    writeFileSync(join(base, 'AGENTS.base.md'), body)
    writeFileSync(join(base, 'VERSION'), version + '\n')
    run(['release', '--base', base, '--out', join(root, 'dist'), '--version', version])
  }
  const consumer = join(root, 'consumer')
  mkdirSync(consumer)
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(join(consumer, 'harness.manifest.json'), JSON.stringify({
    version: '1.0.0',
    base: { source: '../dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [gate('g')],
  }, null, 2) + '\n')
  const out = run(['diff', '--manifest', join(consumer, 'harness.manifest.json'), '--to', '1.1.0'])
  assert.match(out, /base 1\.0\.0 -> 1\.1\.0/)
  assert.match(out, /~ AGENTS\.base\.md/)
  assert.match(out, /! AGENTS\.md/)
  rmSync(root, { recursive: true, force: true })
})

test('metrics computes the first-pass rate from reports', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-metrics-'))
  const log = join(root, 'gates.jsonl')
  writeFileSync(log, [
    JSON.stringify({ results: [{ id: 'a', ok: true }, { id: 'b', ok: true }] }),
    JSON.stringify({ results: [{ id: 'a', ok: true }, { id: 'b', ok: false }] }),
    JSON.stringify({ results: [{ id: 'a', ok: true }, { id: 'b', ok: true }] }),
  ].join('\n') + '\n')
  const out = run(['metrics', '--log', log])
  assert.match(out, /runs: 3/)
  assert.match(out, /first-pass rate: 0\.67/)
  assert.match(out, /failures b: 1/)
  rmSync(root, { recursive: true, force: true })
})

test('gates --report writes a machine-readable summary', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-report-'))
  writeFileSync(join(root, 'AGENTS.delta.md'), '# D\n')
  writeFileSync(join(root, 'harness.manifest.json'), JSON.stringify({
    version: '1.0.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate('ok')],
  }, null, 2) + '\n')
  const report = join(root, 'report.jsonl')
  run(['gates', '--manifest', join(root, 'harness.manifest.json'), '--report', report])
  const entry = JSON.parse(readFileSync(report, 'utf8').trim())
  assert.equal(entry.results[0].id, 'ok')
  assert.equal(entry.results[0].ok, true)
  rmSync(root, { recursive: true, force: true })
})

test('init scaffolds a bootstrap, manifest, CI and is green when the base resolves', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-init-'))
  const target = join(root, 'repo')
  run(['release', '--base', 'base', '--out', join(root, 'dist'), '--version', toolVersion()])
  run(['init', '--dir', target, '--base-source', join(root, 'dist'), '--version', toolVersion()])
  assert.ok(existsSync(join(target, 'harness')))
  assert.ok(existsSync(join(target, 'harness.manifest.json')))
  assert.ok(existsSync(join(target, '.github/workflows/harness.yml')))
  assert.ok(existsSync(join(target, '.gitignore')))
  run(['validate', '--manifest', join(target, 'harness.manifest.json')])
  run(['check', '--manifest', join(target, 'harness.manifest.json')])
  rmSync(root, { recursive: true, force: true })
})
