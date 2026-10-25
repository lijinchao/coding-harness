import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('the self command-review gate runs twice without leftover receipt collisions', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'command-review-gate-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const root = resolve(import.meta.dirname, '..')
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, [join(root, 'bin/harness.mjs'), 'gates', '--manifest', join(root, 'harness.manifest.json'), '--gate', 'command-review'], {
      cwd: root, env: { ...process.env, TMPDIR: dir }, encoding: 'utf8',
    })
    assert.equal(result.status, 0, 'run ' + (i + 1) + ': ' + result.stdout + result.stderr)
  }
})
