import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')
const PACK = resolve(import.meta.dirname, '../packs/node-library')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function git(dir, args) {
  return execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: dir, stdio: 'pipe' })
}

/**
 * The conformance repository a pack owes its consumers: a repository that
 * declares the pack and watches every contributed gate fail and pass again.
 */
const PACKS = ['node-library', 'architecture']
const EXPECTED = [
  'node-library/no-node-modules-committed',
  'node-library/license-file',
  'node-library/no-console-log',
  'architecture/no-generated-source',
  'architecture/one-root-manifest',
]

test('every gate of every shipped pack fires and reverts in one consumer', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-conformance-'))
  const registryFor = (id) => join(root, 'registry-' + id)
  for (const id of PACKS) run(['release', '--base', resolve(import.meta.dirname, '../packs', id), '--out', registryFor(id), '--version', '1.0.0', '--force'])
  const consumer = join(root, 'consumer')
  mkdirSync(join(consumer, 'src'), { recursive: true })
  writeFileSync(join(consumer, 'LICENSE'), 'MIT\n')
  writeFileSync(join(consumer, 'package.json'), '{"name":"fixture"}\n')
  writeFileSync(join(consumer, 'src', 'index.js'), 'export const one = 1\n')
  writeFileSync(join(consumer, '.gitignore'), 'node_modules/\n')
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(join(consumer, 'harness.manifest.json'), JSON.stringify({
    version: '0.1.38',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [],
    packs: PACKS.map((id) => ({ id, source: registryFor(id), version: '1.0.0' })),
  }, null, 2) + '\n')
  git(consumer, ['init', '-q'])
  git(consumer, ['add', '-A'])
  git(consumer, ['commit', '-qm', 'init'])
  const manifest = join(consumer, 'harness.manifest.json')
  run(['validate', '--manifest', manifest])
  const gates = run(['gates', '--manifest', manifest])
  for (const id of EXPECTED) assert.equal(gates.includes('ok\t' + id), true)
  const proved = run(['prove', '--manifest', manifest, '--timeout', '60'])
  for (const id of EXPECTED) {
    assert.match(proved, new RegExp('ok\\t' + id + '\\tfired on the failure and passed after revert'))
  }
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: consumer, encoding: 'utf8' }), '')
  rmSync(root, { recursive: true, force: true })
})