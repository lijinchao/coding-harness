import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
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

let gitAvailable = true
try { execFileSync('git', ['--version'], { stdio: 'ignore' }) } catch { gitAvailable = false }

function git(args, cwd) {
  execFileSync('git', ['-c', 'user.name=harness-test', '-c', 'user.email=harness-test@example.com', ...args], { cwd, stdio: 'pipe' })
}

function makeGitBase(version) {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-git-'))
  const base = join(root, 'base')
  mkdirSync(base)
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n\nShared rules.\n')
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', version])
  git(['init', '-q'], root)
  git(['add', '-A'], root)
  git(['commit', '-qm', 'release'], root)
  git(['tag', 'v' + version], root)
  const consumer = join(root, 'consumer')
  mkdirSync(consumer)
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n\nLocal rules.\n')
  writeFileSync(manifestPath(consumer), JSON.stringify({
    version,
    tool: { version: toolVersion() },
    base: { source: 'git:file://' + root, registry: 'dist', cache: '.harness' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [gate()],
  }, null, 2) + '\n')
  return { root, consumer }
}

test('sync and check fetch a base from a git tag', { skip: !gitAvailable }, () => {
  const { root, consumer } = makeGitBase('0.1.0')
  const manifest = manifestPath(consumer)
  run(['sync', '--manifest', manifest])
  assert.match(readFileSync(join(consumer, 'AGENTS.md'), 'utf8'), /Shared rules/)
  assert.ok(existsSync(join(consumer, '.harness')), 'cache populated')
  const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
  assert.equal(parsed.lock.base.version, '0.1.0')
  assert.equal(parsed.lock.tool.version, toolVersion())
  run(['check', '--manifest', manifest])
  rmSync(root, { recursive: true, force: true })
})

test('check fails when a fetched git base is tampered', { skip: !gitAvailable }, () => {
  const { root, consumer } = makeGitBase('0.1.0')
  const manifest = manifestPath(consumer)
  run(['sync', '--manifest', manifest])
  const hit = execFileSync('find', [join(consumer, '.harness'), '-name', 'AGENTS.base.md'], { encoding: 'utf8' }).trim().split('\n')[0]
  writeFileSync(hit, '# tampered\n')
  assert.throws(() => run(['check', '--manifest', manifest]))
  rmSync(root, { recursive: true, force: true })
})

test('sync rejects a mismatched pinned tool version', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-tool-'))
  const base = join(root, 'base')
  const consumer = join(root, 'consumer')
  mkdirSync(base)
  mkdirSync(consumer)
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n')
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', '0.1.0', '--force'])
  writeFileSync(join(consumer, 'AGENTS.delta.md'), '# Delta\n')
  writeFileSync(manifestPath(consumer), JSON.stringify({
    version: '0.1.0',
    tool: { version: '9.9.9' },
    base: { source: '../dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md', 'AGENTS.delta.md'] }],
    skills: [],
    gates: [gate()],
  }, null, 2) + '\n')
  assert.throws(() => run(['sync', '--manifest', manifestPath(consumer)]))
  rmSync(root, { recursive: true, force: true })
})
