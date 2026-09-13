import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

test('metrics reports duration, skips, timeouts, and flakiness', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-metrics-'))
  const log = join(dir, 'gates.jsonl')
  const entry = (results) => JSON.stringify({ at: '2026-09-12T00:00:00.000Z', version: '1.0.0', tool: '1.0.0', results })
  writeFileSync(log, [
    entry([{ id: 'tests', ok: true, skipped: false, timedOut: false, ms: 100 }, { id: 'slow', ok: true, skipped: false, timedOut: false, ms: 900 }]),
    entry([{ id: 'tests', ok: false, skipped: false, timedOut: false, ms: 120 }, { id: 'slow', ok: true, skipped: false, timedOut: false, ms: 1100 }]),
    entry([{ id: 'tests', ok: true, skipped: false, timedOut: false, ms: 110 }, { id: 'slow', ok: false, skipped: false, timedOut: true, ms: 5000 }]),
    entry([{ id: 'tests', ok: false, skipped: true, timedOut: false, ms: 0 }, { id: 'slow', ok: true, skipped: false, timedOut: false, ms: 1000 }]),
  ].join('\n') + '\n')
  const out = execFileSync(process.execPath, [CLI, 'metrics', '--log', log], { encoding: 'utf8' })
  assert.match(out, /runs: 4/)
  assert.match(out, /green: 1/)
  assert.match(out, /first-pass rate: 0\.25/)
  assert.match(out, /duration p50: \d+ms, p95: \d+ms/)
  assert.match(out, /failures tests: 1 of 4/)
  assert.match(out, /skips tests: 1 of 4/)
  assert.match(out, /timeouts slow: 1 of 4/)
  assert.match(out, /flaky tests: 1 failures in 4 runs/)
  assert.match(out, /slowest: slow \d+ms/)
  rmSync(dir, { recursive: true, force: true })
})
test('a budget judges the window and names each breach', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-budget-'))
  const log = join(dir, 'metrics.jsonl')
  const manifest = join(dir, 'harness.manifest.json')
  const entry = (results) => JSON.stringify({ at: '2026-09-13T00:00:00.000Z', version: '1.0.0', tool: '1.0.0', results })
  const green = [{ id: 'tests', ok: true, skipped: false, timedOut: false, ms: 100 }]
  writeFileSync(log, [
    entry(green),
    entry([{ id: 'tests', ok: false, skipped: false, timedOut: false, ms: 120 }]),
    entry(green),
  ].join('\n') + '\n')
  writeFileSync(manifest, JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [{ id: 'tests', command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'false', revert_command: 'true', severity: 'blocking' }],
    governance: { metrics: { log: 'metrics.jsonl', window: 20, minFirstPassRate: 0.9, maxFlaky: 0 } },
  }, null, 2) + '\n')
  const run = (args) => execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
  const failed = (args) => {
    try {
      run(args)
      return null
    } catch (error) {
      return error.status + ' ' + (error.stderr ?? '')
    }
  }
  const breach = failed(['metrics', '--manifest', manifest])
  assert.match(breach, /first-pass rate 0\.67 is below the declared 0\.9/)
  assert.match(breach, /flaky gates tests exceed the declared 0/)
  writeFileSync(log, [entry(green), entry(green)].join('\n') + '\n')
  const out = run(['metrics', '--manifest', manifest])
  assert.match(out, /window: 2 run\(s\), 2 green/)
  assert.match(out, /first-pass rate: 1\.00/)
  rmSync(dir, { recursive: true, force: true })
})

test('a declared budget with no recorded run is reported', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-budget-missing-'))
  const manifest = join(dir, 'harness.manifest.json')
  writeFileSync(manifest, JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [{ id: 'tests', command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'false', revert_command: 'true', severity: 'blocking' }],
    governance: { metrics: { log: 'metrics.jsonl' } },
  }, null, 2) + '\n')
  assert.throws(() => execFileSync(process.execPath, [CLI, 'metrics', '--manifest', manifest], { encoding: 'utf8', stdio: 'pipe' }))
  rmSync(dir, { recursive: true, force: true })
})
test('a window can exclude the gate that judges it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-budget-exclude-'))
  const log = join(dir, 'metrics.jsonl')
  const manifest = join(dir, 'harness.manifest.json')
  const entry = (results) => JSON.stringify({ at: '2026-09-13T00:00:00.000Z', version: '1.0.0', tool: '1.0.0', results })
  const ok = (id) => ({ id, ok: true, skipped: false, timedOut: false, ms: 10 })
  const bad = (id) => ({ id, ok: false, skipped: false, timedOut: false, ms: 10 })
  writeFileSync(log, [
    entry([ok('tests'), bad('metrics')]),
    entry([ok('tests'), bad('metrics')]),
  ].join('\n') + '\n')
  const gates = ['tests', 'metrics'].map((id) => ({ id, command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'false', revert_command: 'true', severity: 'blocking' }))
  writeFileSync(manifest, JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates,
    governance: { metrics: { log: 'metrics.jsonl', minFirstPassRate: 1, maxFlaky: 0, exclude: ['metrics'] } },
  }, null, 2) + '\n')
  const out = execFileSync(process.execPath, [CLI, 'metrics', '--manifest', manifest], { encoding: 'utf8' })
  assert.match(out, /first-pass rate: 1\.00/)
  assert.doesNotMatch(out, /flaky/)
  rmSync(dir, { recursive: true, force: true })
})
