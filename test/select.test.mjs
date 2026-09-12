import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { matchGlob, selectedGateIds } from '../src/select.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')
function run(args) { return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' }) }

test('matchGlob covers exact paths, single stars, and double stars', () => {
  assert.ok(matchGlob('src/gates.mjs', 'src/gates.mjs'))
  assert.ok(!matchGlob('src/deep/gates.mjs', 'src/gates.mjs'))
  assert.ok(matchGlob('src/gates.mjs', 'src/*.mjs'))
  assert.ok(!matchGlob('src/deep/gates.mjs', 'src/*.mjs'))
  assert.ok(matchGlob('src/deep/gates.mjs', 'src/**'))
  assert.ok(matchGlob('schema/harness.manifest.schema.json', 'schema/**'))
  assert.ok(matchGlob('a.mjs', '**/*.mjs'))
  assert.ok(matchGlob('x/a.mjs', '**/*.mjs'))
  assert.ok(matchGlob('AGENTS.delta.md', 'AGENTS.delta.m?'))
  assert.ok(!matchGlob('AGENTS.delta.md', 'AGENTS.delta.m?d'))
})

const MANIFEST = {
  gates: [{ id: 'tests' }, { id: 'lint', always: true }, { id: 'godot' }],
  surfaces: [
    { id: 'tool', paths: ['src/**', 'bin/*.mjs'], requires: ['tests'] },
    { id: 'engine', paths: ['levels/**', '**/*.gd'], requires: ['godot'] },
  ],
}

test('selection unions the surfaces a change touches and the always gates', () => {
  assert.deepEqual(selectedGateIds(MANIFEST, ['src/gates.mjs']), ['tests', 'lint'])
  assert.deepEqual(selectedGateIds(MANIFEST, ['levels/level_002.json']), ['lint', 'godot'])
  assert.deepEqual(selectedGateIds(MANIFEST, ['src/a.mjs', 'levels/b.json']), ['tests', 'lint', 'godot'])
  assert.deepEqual(selectedGateIds(MANIFEST, ['README.md']), ['lint'])
})

test('a manifest without surfaces selects every gate', () => {
  assert.deepEqual(selectedGateIds({ gates: [{ id: 'a' }, { id: 'b' }] }, ['x']), ['a', 'b'])
})

function consumer() {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-select-'))
  writeFileSync(join(dir, 'AGENTS.delta.md'), '# D\n')
  const gate = (id) => ({ id, command: 'true', protects: 'p', prove_fires: 'f', severity: 'blocking', prove_fires_command: 'true', revert_command: 'true' })
  writeFileSync(join(dir, 'harness.manifest.json'), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate('tests'), gate('godot')],
    surfaces: [
      { id: 'tool', paths: ['src/**'], requires: ['tests'] },
      { id: 'engine', paths: ['levels/**'], requires: ['godot'] },
    ],
  }, null, 2) + '\n')
  return dir
}

test('select prints the gates a changed path requires', () => {
  const dir = consumer()
  const out = run(['select', '--manifest', join(dir, 'harness.manifest.json'), '--changed', 'levels/level_001.json'])
  assert.deepEqual(out.trim().split('\n'), ['godot'])
  rmSync(dir, { recursive: true, force: true })
})

test('validate rejects a gate no surface requires', () => {
  const dir = consumer()
  const path = join(dir, 'harness.manifest.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  manifest.surfaces = [{ id: 'engine', paths: ['levels/**'], requires: ['godot'] }]
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  assert.throws(() => run(['validate', '--manifest', path]))
  rmSync(dir, { recursive: true, force: true })
})

test('validate rejects a surface that requires an unknown gate', () => {
  const dir = consumer()
  const path = join(dir, 'harness.manifest.json')
  const manifest = JSON.parse(readFileSync(path, 'utf8'))
  manifest.surfaces = [
    { id: 'engine', paths: ['levels/**'], requires: ['godot'] },
    { id: 'tool', paths: ['src/**'], requires: ['nope'] },
  ]
  manifest.gates[0].always = true
  writeFileSync(path, JSON.stringify(manifest, null, 2) + '\n')
  assert.throws(() => run(['validate', '--manifest', path]))
  rmSync(dir, { recursive: true, force: true })
})
