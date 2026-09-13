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
