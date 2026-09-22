import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { toolCommit, toolVersion } from '../src/tool.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function manifestPath(dir) {
  return join(dir, 'harness.manifest.json')
}

function gate() {
  return { id: 'drift', command: './harness check', protects: 'composition', prove_fires: 'edit AGENTS.md', severity: 'blocking', prove_fires_command: 'true', revert_command: 'true' }
}

function makeRepo({ pinCommit = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-tool-'))
  const base = join(root, 'base')
  const consumer = join(root, 'consumer')
  mkdirSync(base)
  mkdirSync(consumer)
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n\nShared rules.\n')
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', '0.1.0', '--force'])
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n\nLocal.\n')
  writeFileSync(manifestPath(consumer), JSON.stringify({
    version: '0.1.0',
    tool: { version: toolVersion(), ...(pinCommit ? { commit: toolCommit() } : {}) },
    base: { source: '../dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [gate()],
  }, null, 2) + '\n')
  return { root, consumer }
}

test('the lock records the tool files and check passes', () => {
  const { root, consumer } = makeRepo()
  const manifest = manifestPath(consumer)
  run(['sync', '--manifest', manifest])
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  assert.ok(parsed.lock.tool.files['bin/harness.mjs'])
  assert.ok(parsed.lock.tool.files['src/tool.mjs'])
  assert.ok(parsed.lock.tool.files['package.json'])
  run(['check', '--manifest', manifest])
  rmSync(root, { recursive: true, force: true })
})

test('check fails when a recorded tool file hash is wrong', () => {
  const { root, consumer } = makeRepo()
  const manifest = manifestPath(consumer)
  run(['sync', '--manifest', manifest])
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  parsed.lock.tool.files['src/tool.mjs'] = 'deadbeef'
  writeFileSync(manifest, JSON.stringify(parsed, null, 2) + '\n')
  assert.throws(() => run(['check', '--manifest', manifest]))
  rmSync(root, { recursive: true, force: true })
})

test('check fails when the lock names another tool commit than the pin', () => {
  const { root, consumer } = makeRepo({ pinCommit: true })
  const manifest = manifestPath(consumer)
  run(['sync', '--manifest', manifest])
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  assert.equal(parsed.lock.tool.commit, parsed.tool.commit)
  parsed.lock.tool.commit = 'deadbeef'
  writeFileSync(manifest, JSON.stringify(parsed, null, 2) + '\n')
  assert.throws(() => run(['check', '--manifest', manifest]))
  run(['sync', '--manifest', manifest])
  const repaired = JSON.parse(readFileSync(manifest, 'utf8'))
  assert.equal(repaired.lock.tool.commit, repaired.tool.commit)
  run(['check', '--manifest', manifest])
  rmSync(root, { recursive: true, force: true })
})

test('init writes an executable bootstrap and a valid manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-init-'))
  const dist = join(root, 'dist')
  run(['release', '--base', 'base', '--out', dist, '--version', toolVersion()])
  const dir = join(root, 'consumer')
  run(['init', '--dir', dir, '--base-source', dist, '--provider', 'github', '--version', toolVersion()])
  const shim = join(dir, 'harness')
  assert.ok(existsSync(shim))
  assert.ok((statSync(shim).mode & 0o111) !== 0, 'bootstrap is executable')
  assert.match(readFileSync(shim, 'utf8'), /Bootstrap and run the pinned coding-harness tool/)
  run(['validate', '--manifest', manifestPath(dir)])
  rmSync(root, { recursive: true, force: true })
})
