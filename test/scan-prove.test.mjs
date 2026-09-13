import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { toolVersion } from '../src/tool.mjs'
import { createProofWorktree, removeProofWorktree } from '../src/worktree.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function manifestPath(dir) {
  return join(dir, 'harness.manifest.json')
}

function gate(overrides) {
  return { id: 'g', command: 'harness check', protects: 'p', prove_fires: 'f', severity: 'blocking', prove_fires_command: 'true', revert_command: 'true', ...overrides }
}

function gitRepo(dir) {
  const options = { cwd: dir, stdio: 'pipe' }
  execFileSync('git', ['init', '-q'], options)
  execFileSync('git', ['add', '-A'], options)
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], options)
}

function makeConsumer(root, name) {
  const base = join(root, 'base')
  const consumer = join(root, name)
  mkdirSync(base, { recursive: true })
  mkdirSync(consumer, { recursive: true })
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n\nShared.\n')
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', '0.1.0', '--force'])
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath(consumer), JSON.stringify({
    version: '0.1.0',
    tool: { version: toolVersion() },
    base: { source: '../dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [gate()],
  }, null, 2) + '\n')
  return consumer
}

test('scan passes when every consumer is clean', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-scan-'))
  const a = makeConsumer(root, 'a')
  run(['sync', '--manifest', manifestPath(a)])
  run(['scan', '--root', root])
  rmSync(root, { recursive: true, force: true })
})

test('scan fails when a consumer has diverged', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-scan-'))
  const a = makeConsumer(root, 'a')
  const b = makeConsumer(root, 'b')
  run(['sync', '--manifest', manifestPath(a)])
  run(['sync', '--manifest', manifestPath(b)])
  writeFileSync(join(b, 'AGENTS.md'), '# tampered\n')
  assert.throws(() => run(['scan', '--root', root]))
  rmSync(root, { recursive: true, force: true })
})

test('prove passes a gate that fires and is reverted', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-'))
  writeFileSync(join(root, 'marker.txt'), 'x\n')
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath(root), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({ id: 'good', command: 'test -f marker.txt', prove_fires_command: 'rm -f marker.txt', revert_command: "printf 'x\\n' > marker.txt" })],
  }, null, 2) + '\n')
  gitRepo(root)
  run(['prove', '--manifest', manifestPath(root), '--gate', 'good'])
  rmSync(root, { recursive: true, force: true })
})

test('prove fails a gate whose action no longer fires', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-'))
  writeFileSync(join(root, 'marker.txt'), 'x\n')
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath(root), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({ id: 'dead', command: 'test -f marker.txt', prove_fires_command: 'true', revert_command: 'true' })],
  }, null, 2) + '\n')
  gitRepo(root)
  assert.throws(() => run(['prove', '--manifest', manifestPath(root), '--gate', 'dead']))
  rmSync(root, { recursive: true, force: true })
})

test('prove refuses a dirty working tree instead of reverting over it', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-dirty-'))
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(join(root, 'target.txt'), 'original\n')
  writeFileSync(manifestPath(root), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({ id: 'target', command: 'grep -q original target.txt', prove_fires_command: "printf 'broken\\n' > target.txt", revert_command: 'git checkout -- target.txt' })],
  }, null, 2) + '\n')
  gitRepo(root)
  writeFileSync(join(root, 'target.txt'), 'user-uncommitted\n')
  assert.throws(() => run(['prove', '--manifest', manifestPath(root), '--gate', 'target']))
  assert.equal(readFileSync(join(root, 'target.txt'), 'utf8'), 'user-uncommitted\n')
  rmSync(root, { recursive: true, force: true })
})

test('prove refuses a directory that is not a git working tree', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-nogit-'))
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath(root), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({ id: 'good', command: 'true', prove_fires_command: 'true', revert_command: 'true' })],
  }, null, 2) + '\n')
  assert.throws(() => run(['prove', '--manifest', manifestPath(root), '--gate', 'good']))
  rmSync(root, { recursive: true, force: true })
})

test('a recorded proof survives a sync revert when a base is pinned', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-base-'))
  const base = join(root, 'base')
  mkdirSync(base, { recursive: true })
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n')
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', '0.1.0', '--force'])
  const consumer = join(root, 'consumer')
  mkdirSync(consumer)
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n')
  const path = manifestPath(consumer)
  writeFileSync(path, JSON.stringify({
    version: '0.1.0',
    base: { source: '../dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({
      id: 'drift',
      command: `node ${CLI} check --manifest harness.manifest.json`,
      prove_fires_command: "printf '<!-- prove -->\\n' >> AGENTS.md",
      revert_command: `node ${CLI} sync --manifest harness.manifest.json`,
    })],
  }, null, 2) + '\n')
  run(['sync', '--manifest', path])
  gitRepo(consumer)
  run(['prove', '--manifest', path, '--gate', 'drift', '--record'])
  gitRepo(consumer)
  run(['prove', '--manifest', path, '--gate', 'drift', '--timeout', '60'])
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: consumer, encoding: 'utf8' }), '')
  rmSync(root, { recursive: true, force: true })
})

test('a recorded proof survives a sync revert and a second prove', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-repeat-'))
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  const path = manifestPath(root)
  writeFileSync(path, JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({
      id: 'drift',
      command: `node ${CLI} check --manifest harness.manifest.json`,
      prove_fires_command: "printf '<!-- prove -->\\n' >> AGENTS.md",
      revert_command: `node ${CLI} sync --manifest harness.manifest.json`,
    })],
  }, null, 2) + '\n')
  run(['sync', '--manifest', path])
  gitRepo(root)
  run(['prove', '--manifest', path, '--gate', 'drift', '--record'])
  gitRepo(root)
  run(['prove', '--manifest', path, '--gate', 'drift', '--timeout', '60'])
  assert.ok(JSON.parse(readFileSync(path, 'utf8')).lock.proofs.drift)
  assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }), '')
  rmSync(root, { recursive: true, force: true })
})

test('prove --isolated runs in a worktree and leaves the real tree untouched', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-isolated-'))
  const pwdLog = join(tmpdir(), 'coding-harness-prove-pwd-' + Date.now() + '.log')
  writeFileSync(join(root, '.gitignore'), '.harness/\n')
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(join(root, 'marker.txt'), 'x\n')
  mkdirSync(join(root, '.harness'), { recursive: true })
  writeFileSync(join(root, '.harness', 'carried.txt'), 'carried\n')
  writeFileSync(manifestPath(root), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({
      id: 'target',
      command: `test -f marker.txt && test -f .harness/carried.txt && test -z "$(git ls-files -o --exclude-standard)" && printf '%s\\n' "$(pwd)" >> '${pwdLog}'`,
      prove_fires_command: 'rm -f marker.txt',
      revert_command: "printf 'x\\n' > marker.txt",
    })],
  }, null, 2) + '\n')
  gitRepo(root)
  run(['prove', '--manifest', manifestPath(root), '--gate', 'target', '--isolated', '--timeout', '60'])
  const logged = readFileSync(pwdLog, 'utf8').trim()
  assert.notEqual(logged, root)
  assert.match(logged, /coding-harness-prove-/)
  assert.equal(readFileSync(join(root, 'marker.txt'), 'utf8'), 'x\n')
  assert.equal(execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8' }), '')
  assert.equal(execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' }).trim().split('\n').length, 1)
  rmSync(root, { recursive: true, force: true })
  rmSync(pwdLog, { force: true })
})

test('an isolated worktree keeps a carried cache invisible to git', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-worktree-'))
  writeFileSync(join(root, '.gitignore'), '.harness/\nnode_modules/\n')
  writeFileSync(join(root, 'tracked.txt'), 'x\n')
  mkdirSync(join(root, '.harness', 'tool'), { recursive: true })
  writeFileSync(join(root, '.harness', 'tool', 'carried.txt'), 'carried\n')
  mkdirSync(join(root, 'node_modules', 'pkg'), { recursive: true })
  writeFileSync(join(root, 'node_modules', 'pkg', 'index.js'), '\n')
  gitRepo(root)
  const { dir, links } = createProofWorktree(root)
  assert.equal(execFileSync('git', ['-C', dir, 'ls-files', '-o', '--exclude-standard'], { encoding: 'utf8' }), '')
  assert.equal(readFileSync(join(dir, '.harness', 'tool', 'carried.txt'), 'utf8'), 'carried\n')
  assert.equal(readFileSync(join(dir, 'node_modules', 'pkg', 'index.js'), 'utf8'), '\n')
  assert.ok(links.includes(join('.harness', 'tool')))
  removeProofWorktree(root, dir)
  assert.equal(execFileSync('git', ['-C', root, 'worktree', 'list'], { encoding: 'utf8' }).trim().split('\n').length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('prove times out a hung proof command', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-prove-timeout-'))
  writeFileSync(join(root, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath(root), JSON.stringify({
    version: '0.1.0',
    compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }],
    skills: [],
    gates: [gate({ id: 'hang', command: 'true', prove_fires_command: 'sleep 30', revert_command: 'true' })],
  }, null, 2) + '\n')
  gitRepo(root)
  assert.throws(() => run(['prove', '--manifest', manifestPath(root), '--gate', 'hang', '--timeout', '1']))
  rmSync(root, { recursive: true, force: true })
})
