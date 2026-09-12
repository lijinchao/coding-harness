import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { SHIM } from '../src/shim.mjs'
import { toolRoot } from '../src/tool.mjs'
import { applySync, inspect } from '../src/state.mjs'

const tool = toolRoot()

test('the committed bootstrap matches the template the tool ships', () => {
  const committed = readFileSync(resolve(tool, 'harness'), 'utf8')
  assert.equal(committed, SHIM)
})

test('the bootstrap resolves the manifest next to itself, not the current directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-shim-'))
  const elsewhere = mkdtempSync(join(tmpdir(), 'coding-harness-cwd-'))
  const shim = join(dir, 'harness')
  writeFileSync(shim, SHIM)
  chmodSync(shim, 0o755)
  writeFileSync(join(dir, 'harness.manifest.json'), JSON.stringify({
    version: '0.0.0',
    tool: { version: '0.0.0', source: tool },
    compositions: [],
    skills: [],
    gates: [],
  }, null, 2) + '\n')
  const output = execFileSync(shim, ['--help'], { cwd: elsewhere, encoding: 'utf8' })
  assert.match(output, /usage: harness/)
  rmSync(dir, { recursive: true, force: true })
  rmSync(elsewhere, { recursive: true, force: true })
})

function consumer() {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-bootstrap-'))
  writeFileSync(join(dir, 'harness.manifest.json'), JSON.stringify({
    version: '0.0.0',
    compositions: [],
    skills: [],
    gates: [],
  }, null, 2) + '\n')
  return dir
}

test('sync materializes the bootstrap and check accepts it', () => {
  const dir = consumer()
  const path = join(dir, 'harness.manifest.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  applySync(dir, path, manifest)
  const shim = join(dir, 'harness')
  assert.equal(readFileSync(shim, 'utf8'), SHIM)
  assert.equal(statSync(shim).mode & 0o777, 0o755)
  assert.deepEqual(inspect(dir, manifest), { status: 'ok', detail: '0 composition(s) match 0.0.0' })
  rmSync(dir, { recursive: true, force: true })
})

test('check flags a stale or missing bootstrap', () => {
  const dir = consumer()
  const path = join(dir, 'harness.manifest.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  applySync(dir, path, manifest)
  writeFileSync(join(dir, 'harness'), '#!/bin/sh\n')
  assert.match(inspect(dir, manifest).detail, /bootstrap is stale/)
  rmSync(join(dir, 'harness'))
  assert.match(inspect(dir, manifest).detail, /bootstrap missing/)
  rmSync(dir, { recursive: true, force: true })
})
