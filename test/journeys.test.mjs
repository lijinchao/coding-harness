import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { SHIM } from '../src/shim.mjs'
import { toolVersion } from '../src/tool.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function git(dir, args) {
  execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' })
}

function gitRepo(dir) {
  git(dir, ['init', '-q'])
  git(dir, ['add', '-A'])
  git(dir, ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'])
}

function status(dir) {
  return execFileSync('git', ['-C', dir, 'status', '--porcelain'], { encoding: 'utf8' })
}

test('journey: init a consumer, customize it, check it, then prove it', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-journey-init-'))
  cpSync(resolve(import.meta.dirname, '../base'), join(root, 'base'), { recursive: true })
  run(['release', '--base', join(root, 'base'), '--out', join(root, 'dist'), '--version', toolVersion(), '--force'])
  const consumer = join(root, 'consumer')
  run(['init', '--dir', consumer, '--base-source', join(root, 'dist'), '--version', toolVersion()])
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n\n- Run the tests before reporting done.\n')
  run(['sync', '--manifest', join(consumer, 'harness.manifest.json')])
  run(['check', '--manifest', join(consumer, 'harness.manifest.json')])
  gitRepo(consumer)
  run(['prove', '--manifest', join(consumer, 'harness.manifest.json'), '--record', '--timeout', '60'])
  gitRepo(consumer)
  run(['prove', '--manifest', join(consumer, 'harness.manifest.json'), '--isolated', '--timeout', '60'])
  assert.equal(status(consumer), '')
  rmSync(root, { recursive: true, force: true })
})

test('journey: release a new base, upgrade a consumer, keep its proofs, then prove it', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-journey-release-'))
  mkdirSync(join(root, 'base'), { recursive: true })
  writeFileSync(join(root, 'base', 'AGENTS.base.md'), '# Base\n\nShared rules.\n')
  run(['release', '--base', join(root, 'base'), '--out', join(root, 'dist'), '--version', '0.1.0', '--force'])
  const consumer = join(root, 'consumer')
  mkdirSync(consumer)
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(join(consumer, 'harness'), SHIM, { mode: 0o755 })
  writeFileSync(join(consumer, 'harness.manifest.json'), JSON.stringify({
    version: '0.1.0',
    base: { source: join(root, 'dist') },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [{
      id: 'drift',
      command: `node ${CLI} check --manifest harness.manifest.json`,
      protects: 'the composed output matches the pinned base',
      prove_fires: 'edit AGENTS.md',
      severity: 'blocking',
      prove_fires_command: "printf '<!-- prove -->\\n' >> AGENTS.md",
      revert_command: `node ${CLI} sync --manifest harness.manifest.json`,
    }],
  }, null, 2) + '\n')
  run(['sync', '--manifest', join(consumer, 'harness.manifest.json')])
  run(['check', '--manifest', join(consumer, 'harness.manifest.json')])
  gitRepo(consumer)
  run(['prove', '--manifest', join(consumer, 'harness.manifest.json'), '--record', '--timeout', '60'])
  gitRepo(consumer)
  writeFileSync(join(root, 'base', 'AGENTS.base.md'), '# Base\n\nShared rules.\n\nA new rule.\n')
  run(['release', '--base', join(root, 'base'), '--out', join(root, 'dist'), '--version', '0.1.1', '--force'])
  run(['upgrade', '--manifest', join(consumer, 'harness.manifest.json'), '--to', '0.1.1'])
  run(['check', '--manifest', join(consumer, 'harness.manifest.json')])
  assert.ok(JSON.parse(readFileSync(join(consumer, 'harness.manifest.json'), 'utf8')).lock.proofs.drift)
  gitRepo(consumer)
  run(['prove', '--manifest', join(consumer, 'harness.manifest.json'), '--isolated', '--timeout', '60'])
  assert.equal(status(consumer), '')
  rmSync(root, { recursive: true, force: true })
})
