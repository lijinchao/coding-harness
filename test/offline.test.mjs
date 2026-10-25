import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, chmodSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { SHIM } from '../src/shim.mjs'
import { ensureGitCheckout } from '../src/fetch.mjs'
import { createRelease } from '../src/release.mjs'
import { resolveBase } from '../src/state.mjs'
import { resolvePack } from '../src/pack.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'harness-offline-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { stdio: 'pipe' })
  const init = dir => { mkdirSync(dir, { recursive: true }); git(dir, 'init', '-q') }
  const commit = dir => { git(dir, 'add', '.'); git(dir, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'fixture'); return git(dir, 'rev-parse', 'HEAD').toString().trim() }
  return { root, git, init, commit }
}

test('offline base cache miss fails before creating a clone directory', t => {
  const { root } = fixture(t)
  const previous = process.env.HARNESS_OFFLINE
  process.env.HARNESS_OFFLINE = '1'
  try { assert.throws(() => ensureGitCheckout('git:' + join(root, 'absent'), '0.0.1', join(root, 'cache')), /offline.*cache/i) }
  finally { if (previous === undefined) delete process.env.HARNESS_OFFLINE; else process.env.HARNESS_OFFLINE = previous }
  assert.equal(existsSync(join(root, 'cache')), false)
})

test('bootstrap --offline prevents clone before loading the CLI', t => {
  const { root } = fixture(t)
  const spy = join(root, 'bin'); mkdirSync(spy)
  const calls = join(root, 'git-calls')
  writeFileSync(join(spy, 'git'), '#!/bin/sh\nprintf "%s\\n" "$*" >> "$GIT_CALL_LOG"\nexit 1\n', { mode: 0o755 })
  writeFileSync(join(root, 'harness'), SHIM, { mode: 0o755 })
  writeFileSync(join(root, 'harness.manifest.json'), JSON.stringify({ tool: { version: '0.0.1', commit: 'a'.repeat(40), source: 'git:https://example.invalid/tool.git' } }))
  const result = spawnSync(join(root, 'harness'), ['check', '--offline'], { encoding: 'utf8', timeout: 5000, env: { ...process.env, PATH: spy + ':' + process.env.PATH, GIT_CALL_LOG: calls } })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /offline.*cache/i)
  assert.doesNotMatch(existsSync(calls) ? readFileSync(calls, 'utf8') : '', /clone|fetch/)
})

test('manual worktree borrows the verified tool and base cache offline', t => {
  const { root, git, init, commit } = fixture(t)
  const main = join(root, 'main'); init(main)
  const cached = join(main, '.harness/tool/v0.0.1'); init(cached)
  mkdirSync(join(cached, 'bin'))
  writeFileSync(join(cached, 'bin/harness.mjs'), "console.log('cached:' + process.env.HARNESS_OFFLINE)\n")
  const pin = commit(cached)
  writeFileSync(join(main, '.gitignore'), '.harness/\n')
  writeFileSync(join(main, 'harness'), SHIM, { mode: 0o755 })
  writeFileSync(join(main, 'harness.manifest.json'), JSON.stringify({ tool: { version: '0.0.1', commit: pin, source: 'git:https://example.invalid/tool.git' } }))
  commit(main)
  const worktree = join(root, 'worktree'); git(main, 'worktree', 'add', '--detach', worktree)
  const result = spawnSync(join(worktree, 'harness'), ['--offline'], { encoding: 'utf8', timeout: 5000 })
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /cached:1/)
  const wrong = JSON.parse(readFileSync(join(worktree, 'harness.manifest.json')))
  wrong.tool.commit = 'b'.repeat(40)
  writeFileSync(join(worktree, 'harness.manifest.json'), JSON.stringify(wrong))
  const mismatch = spawnSync(join(worktree, 'harness'), ['--offline'], { encoding: 'utf8', timeout: 5000 })
  assert.notEqual(mismatch.status, 0)
  assert.match(mismatch.stderr, /pinned|offline/)
})

test('base and pack resolution reuse main-worktree caches and still verify bytes', t => {
  const { root, git, init, commit } = fixture(t)
  const source = join(root, 'source'); init(source)
  const base = join(root, 'base'); mkdirSync(base)
  writeFileSync(join(base, 'AGENTS.base.md'), '# original\n')
  writeFileSync(join(base, 'pack.json'), JSON.stringify({ id: 'sample', gates: [], surfaces: [], skills: [] }))
  createRelease(base, join(source, 'dist'), '0.0.1')
  commit(source); git(source, 'tag', 'v0.0.1'); git(source, 'tag', 'pack/sample/v0.0.1')
  const main = join(root, 'main'); init(main)
  writeFileSync(join(main, '.gitignore'), '.harness/\n'); commit(main)
  const url = 'git:' + source
  const cached = ensureGitCheckout(url, '0.0.1', join(main, '.harness'))
  ensureGitCheckout(url, '0.0.1', join(main, '.harness'), 'pack/sample/v0.0.1')
  const worktree = join(root, 'worktree'); git(main, 'worktree', 'add', '--detach', worktree)
  const previous = process.env.HARNESS_OFFLINE; process.env.HARNESS_OFFLINE = '1'
  try {
    assert.equal(resolveBase(worktree, { version: '0.0.1', base: { source: url } }).release.version, '0.0.1')
    assert.equal(resolvePack(worktree, { id: 'sample', source: url, version: '0.0.1' }, '0.0.1').id, 'sample')
    assert.equal(existsSync(join(worktree, '.harness')), false, 'no second clone/cache should be created')
    writeFileSync(join(cached, 'dist/base@0.0.1/AGENTS.base.md'), '# corrupt\n')
    assert.throws(() => resolveBase(worktree, { version: '0.0.1', base: { source: url } }), /content does not match release\.json/)
  } finally { if (previous === undefined) delete process.env.HARNESS_OFFLINE; else process.env.HARNESS_OFFLINE = previous }
})
