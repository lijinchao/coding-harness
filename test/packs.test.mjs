import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function fails(args) {
  try {
    run(args)
    return null
  } catch (error) {
    return String(error.stdout ?? '') + String(error.stderr ?? '')
  }
}

function gate(id, overrides = {}) {
  return { id, command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'false', revert_command: 'true', severity: 'blocking', ...overrides }
}

function packJson(overrides = {}) {
  return {
    id: 'demo',
    kernelVersion: '>=0.1.0',
    gates: [gate('demo/architecture')],
    surfaces: [{ id: 'demo/src', paths: ['src/**'], requires: ['demo/architecture'] }],
    ...overrides,
  }
}

function makePack(root, descriptor) {
  const dir = join(root, 'demo-pack')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'pack.json'), JSON.stringify(descriptor, null, 2) + '\n')
  run(['release', '--base', dir, '--out', join(root, 'registry'), '--version', '1.0.0', '--force'])
  return join(root, 'registry')
}

function makeConsumer(root, registry, overrides = {}) {
  const dir = join(root, 'consumer')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'AGENTS.delta.md'), '# Delta\n')
  const manifest = {
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [],
    packs: [{ id: 'demo', source: registry, version: '1.0.0' }],
    ...overrides,
  }
  if (manifest.gates.length === 0 && manifest.overrides === undefined) manifest.gates = []
  writeFileSync(join(dir, 'harness.manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return dir
}

test('a declared pack contributes namespaced gates, surfaces, and a lock record', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-pack-'))
  const registry = makePack(root, packJson())
  const consumer = makeConsumer(root, registry)
  const manifest = join(consumer, 'harness.manifest.json')
  run(['sync', '--manifest', manifest])
  const written = JSON.parse(readFileSync(manifest, 'utf8'))
  assert.deepEqual(written.gates, [], 'a pack gate is never materialized into the repository file')
  assert.ok(written.lock.packs.demo.files['pack.json'])
  assert.equal(written.lock.packs.demo.version, '1.0.0')
  const selected = run(['select', '--manifest', manifest, '--changed', 'src/index.ts'])
  assert.match(selected, /demo\/architecture/)
  run(['validate', '--manifest', manifest])
  rmSync(root, { recursive: true, force: true })
})

test('a pack id that is not namespaced is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-pack-id-'))
  const registry = makePack(root, packJson({ gates: [gate('architecture')] }))
  const consumer = makeConsumer(root, registry)
  assert.match(fails(['validate', '--manifest', join(consumer, 'harness.manifest.json')]), /must be namespaced demo\/<name>/)
  rmSync(root, { recursive: true, force: true })
})

test('a pack that needs a newer kernel is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-pack-kernel-'))
  const registry = makePack(root, packJson({ kernelVersion: '>=9.0.0' }))
  const consumer = makeConsumer(root, registry)
  assert.match(fails(['validate', '--manifest', join(consumer, 'harness.manifest.json')]), /needs kernel >= 9\.0\.0 but this repository pins 0\.1\.0/)
  rmSync(root, { recursive: true, force: true })
})

test('a pack dependency that is not declared is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-pack-dep-'))
  const registry = makePack(root, packJson({ packs: ['other'] }))
  const consumer = makeConsumer(root, registry)
  assert.match(fails(['validate', '--manifest', join(consumer, 'harness.manifest.json')]), /requires pack other, which is not declared/)
  rmSync(root, { recursive: true, force: true })
})

test('a repository gate overrides a pack gate only when it says so', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-pack-override-'))
  const registry = makePack(root, packJson())
  const consumer = makeConsumer(root, registry, { gates: [gate('demo/architecture')] })
  const manifest = join(consumer, 'harness.manifest.json')
  assert.match(fails(['validate', '--manifest', manifest]), /collides with a repository gate; declare override: true/)
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  parsed.gates[0].override = true
  writeFileSync(manifest, JSON.stringify(parsed, null, 2) + '\n')
  run(['sync', '--manifest', manifest])
  const written = JSON.parse(readFileSync(manifest, 'utf8'))
  assert.deepEqual(written.lock.overrides, ['demo/architecture'])
  assert.equal(written.gates.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('a pack failure leaves the manifest untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-pack-atomic-'))
  const registry = makePack(root, packJson({ kernelVersion: '>=9.0.0' }))
  const consumer = makeConsumer(root, registry)
  const manifest = join(consumer, 'harness.manifest.json')
  const before = readFileSync(manifest, 'utf8')
  fails(['sync', '--manifest', manifest])
  assert.equal(readFileSync(manifest, 'utf8'), before)
  rmSync(root, { recursive: true, force: true })
})
