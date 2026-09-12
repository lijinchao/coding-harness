import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { validateManifest } from '../src/manifest.mjs'
import { composeText } from '../src/compose.mjs'
import { toolVersion } from '../src/tool.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function manifestPath(dir) {
  return join(dir, 'harness.manifest.json')
}

function gate() {
  return { id: 'drift', command: 'harness check', protects: 'composition', prove_fires: 'edit AGENTS.md', severity: 'blocking', prove_fires_command: 'true', revert_command: 'true' }
}

function makeRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-'))
  writeFileSync(join(dir, 'AGENTS.base.md'), '# Base\n\nShared rules.\n')
  writeFileSync(join(dir, 'AGENTS.delta.md'), '# Delta\n\nLocal rules.\n')
  writeFileSync(manifestPath(dir), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [gate()],
  }, null, 2) + '\n')
  return dir
}

function makePinnedRepo(version) {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-pinned-'))
  const base = join(root, 'base')
  const dist = join(root, 'dist')
  const consumer = join(root, 'consumer')
  mkdirSync(base)
  mkdirSync(consumer)
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n\nShared rules.\n')
  run(['release', '--base', base, '--out', dist, '--version', version])
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n\nLocal rules.\n')
  writeFileSync(manifestPath(consumer), JSON.stringify({
    version,
    base: { source: '../dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [gate()],
  }, null, 2) + '\n')
  return { root, base, dist, consumer }
}

test('validate accepts a well-formed manifest', () => {
  const errors = validateManifest({
    version: '1',
    compositions: [{ output: 'a', sources: ['b'] }],
    skills: [],
    gates: [],
  })
  assert.deepEqual(errors, [])
})

test('validate rejects a gate without prove_fires', () => {
  const errors = validateManifest({
    version: '1',
    compositions: [{ output: 'a', sources: ['b'] }],
    skills: [],
    gates: [{ id: 'x', command: 'c', protects: 'p', severity: 'blocking', prove_fires_command: 'true', revert_command: 'true' }],
  })
  assert.ok(errors.some((error) => error.includes('prove_fires')))
})

test('validate rejects a base without a source and a lock without base files', () => {
  const baseErrors = validateManifest({
    version: '1',
    base: {},
    compositions: [{ output: 'a', sources: ['b'] }],
    skills: [],
    gates: [],
  })
  assert.ok(baseErrors.some((error) => error.includes('base.source')))
  const lockErrors = validateManifest({
    version: '1',
    compositions: [{ output: 'a', sources: ['b'] }],
    skills: [],
    gates: [],
    lock: { version: '1', outputs: {}, base: { version: '1' } },
  })
  assert.ok(lockErrors.some((error) => error.includes('lock.base.files')))
})

test('compose joins sources in declaration order', () => {
  const dir = makeRepo()
  assert.equal(composeText(dir, ['AGENTS.base.md', 'AGENTS.delta.md']), '# Base\n\nShared rules.\n\n# Delta\n\nLocal rules.\n')
  rmSync(dir, { recursive: true, force: true })
})

test('sync composes the output, and check passes until the output drifts', () => {
  const dir = makeRepo()
  run(['sync', '--manifest', manifestPath(dir)])
  assert.match(readFileSync(join(dir, 'AGENTS.md'), 'utf8'), /Shared rules/)
  run(['check', '--manifest', manifestPath(dir)])
  writeFileSync(join(dir, 'AGENTS.md'), '# tampered\n')
  assert.throws(() => run(['check', '--manifest', manifestPath(dir)]))
  rmSync(dir, { recursive: true, force: true })
})

test('init scaffolds a delta and a manifest', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-init-'))
  const dist = join(root, 'dist')
  run(['release', '--base', 'base', '--out', dist, '--version', toolVersion()])
  const dir = join(root, 'consumer')
  run(['init', '--dir', dir, '--base-source', dist, '--version', toolVersion()])
  assert.match(readFileSync(join(dir, 'AGENTS.delta.md'), 'utf8'), /Repository delta/)
  run(['validate', '--manifest', manifestPath(dir)])
  rmSync(root, { recursive: true, force: true })
})

test('release emits a versioned base with per-file hashes and sync pins it', () => {
  const { root, consumer, dist } = makePinnedRepo('0.1.0')
  const manifest = manifestPath(consumer)
  run(['sync', '--manifest', manifest])
  assert.match(readFileSync(join(consumer, 'AGENTS.md'), 'utf8'), /Shared rules/)
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  assert.equal(parsed.lock.base.version, '0.1.0')
  assert.ok(parsed.lock.base.files['AGENTS.base.md'])
  assert.ok(readFileSync(join(dist, 'base@0.1.0', 'release.json'), 'utf8').includes('AGENTS.base.md'))
  run(['check', '--manifest', manifest])
  rmSync(root, { recursive: true, force: true })
})

test('check fails when the fetched base is tampered', () => {
  const { root, consumer, dist } = makePinnedRepo('0.1.0')
  const manifest = manifestPath(consumer)
  run(['sync', '--manifest', manifest])
  writeFileSync(join(dist, 'base@0.1.0', 'AGENTS.base.md'), '# tampered\n')
  assert.throws(() => run(['check', '--manifest', manifest]))
  rmSync(root, { recursive: true, force: true })
})

test('sync refuses a base that differs from the pinned lock', () => {
  const { root, base, consumer } = makePinnedRepo('0.1.0')
  const manifest = manifestPath(consumer)
  run(['sync', '--manifest', manifest])
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base v2\n\nChanged.\n')
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', '0.1.0', '--force'])
  assert.throws(() => run(['sync', '--manifest', manifest]))
  rmSync(root, { recursive: true, force: true })
})

test('a relocated consumer resolves the same pinned base', () => {
  const { root, consumer } = makePinnedRepo('0.1.0')
  run(['sync', '--manifest', manifestPath(consumer)])
  const moved = mkdtempSync(join(tmpdir(), 'coding-harness-moved-'))
  cpSync(root, join(moved, 'copy'), { recursive: true })
  run(['check', '--manifest', join(moved, 'copy', 'consumer', 'harness.manifest.json')])
  rmSync(root, { recursive: true, force: true })
  rmSync(moved, { recursive: true, force: true })
})

test('upgrade moves the pin to a new base version', () => {
  const { root, base, consumer } = makePinnedRepo('0.1.0')
  const manifest = manifestPath(consumer)
  run(['sync', '--manifest', manifest])
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n\nShared rules v2.\n')
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', '0.2.0', '--force'])
  run(['upgrade', '--manifest', manifest, '--to', '0.2.0'])
  assert.match(readFileSync(join(consumer, 'AGENTS.md'), 'utf8'), /Shared rules v2/)
  run(['check', '--manifest', manifest])
  rmSync(root, { recursive: true, force: true })
})
