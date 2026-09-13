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

test('an attestation verifies the release and fails when the lock moves', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-attest-'))
  mkdirSync(join(root, 'base'), { recursive: true })
  writeFileSync(join(root, 'base', 'AGENTS.base.md'), '# Base\n')
  run(['release', '--base', join(root, 'base'), '--out', join(root, 'dist'), '--version', '0.1.0', '--force'])
  const manifestPath = join(root, 'harness.manifest.json')
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  const git = (args) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...args], { cwd: root, stdio: 'pipe' })
  git(['init', '-q'])
  git(['add', '-A'])
  git(['commit', '-qm', 'release'])
  const RELEASE = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  writeFileSync(manifestPath, JSON.stringify({
    version: '0.1.0',
    tool: { version: '0.1.0', commit: RELEASE },
    base: { source: 'dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [{ id: 'g', command: 'true', protects: 'p', prove_fires: 'f', prove_fires_command: 'false', revert_command: 'true', severity: 'blocking' }],
    lock: { version: '0.1.0', outputs: {}, proofs: { g: { at: '2026-01-01T00:00:00.000Z', tool: RELEASE, definition: 'd' } } },
  }, null, 2) + '\n')
  git(['add', '-A'])
  git(['commit', '-qm', 'pin'])
  git(['tag', 'v0.1.0', RELEASE])
  const out = join(root, 'attestation.json')
  run(['attest', '--manifest', manifestPath, '--out', out])
  const attested = JSON.parse(readFileSync(out, 'utf8'))
  assert.equal(attested.version, '0.1.0')
  assert.equal(attested.tag, attested.toolCommit)
  run(['attest', '--manifest', manifestPath, '--out', out, '--verify'])
  const parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  parsed.lock.proofs.g.tool = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
  writeFileSync(manifestPath, JSON.stringify(parsed, null, 2) + '\n')
  assert.throws(() => run(['attest', '--manifest', manifestPath, '--out', out, '--verify']))
  rmSync(root, { recursive: true, force: true })
})