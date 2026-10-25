import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { proveGate } from '../src/prove.mjs'

const timeoutZero = `exec sh -c 'trap "exit 0" TERM; while :; do :; done'`
const terminated = `exec sh -c 'kill -TERM $$'`
const normalGate = { id: 'g', severity: 'blocking', command: 'test ! -f injected',
  prove_fires_command: 'touch injected', revert_command: 'rm -f injected' }

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'harness-proof-completion-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' })
  git('init', '-q')
  const commit = () => { git('add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '--allow-empty', '-qm', 'fixture') }
  commit()
  return { root, git, commit }
}

for (const [mode, abnormal] of [['timeout exiting zero', timeoutZero], ['signal', terminated]]) {
  for (const stage of ['setup', 'injection', 'injected check', 'revert', 'restored setup', 'recovery']) {
    test(`${stage} rejects ${mode}`, async t => {
      const { root, git } = fixture(t)
      const gate = { ...normalGate }
      if (stage === 'setup') gate.setup_command = abnormal
      if (stage === 'injection') gate.prove_fires_command = 'touch injected; ' + abnormal
      if (stage === 'injected check') gate.command = 'if [ -f injected ]; then ' + abnormal + '; fi'
      if (stage === 'revert') gate.revert_command = 'rm -f injected; ' + abnormal
      if (stage === 'restored setup') gate.setup_command = 'if [ -f .git/setup-seen ]; then ' + abnormal + '; else touch .git/setup-seen; fi'
      if (stage === 'recovery') gate.command = 'if [ -f injected ]; then exit 1; else ' + abnormal + '; fi'
      const result = await proveGate(root, gate, 500)
      assert.equal(result.status, 'error', JSON.stringify(result))
      assert.match(result.detail, /timeout|timed out|signal/)
      assert.equal(existsSync(join(root, 'injected')), false, 'revert is attempted after injection')
      assert.equal(git('status', '--porcelain').toString(), '')
    })
  }
}

test('CLI refuses to record a recovery timeout even when cleanup exits zero', t => {
  const { root, commit } = fixture(t)
  const path = join(root, 'harness.manifest.json')
  const gate = { ...normalGate, protects: 'completed recovery', prove_fires: 'create marker',
    command: 'if [ -f injected ]; then exit 1; else ' + timeoutZero + '; fi' }
  writeFileSync(join(root, 'source.md'), '# Fixture\n')
  const before = JSON.stringify({ version: '0.1.46', compositions: [{ output: 'AGENTS.md', sources: ['source.md'] }], skills: [], gates: [gate] })
  writeFileSync(path, before)
  commit()
  const cli = resolve(import.meta.dirname, '../bin/harness.mjs')
  const result = spawnSync(process.execPath, [cli, 'prove', '--manifest', path, '--record', '--timeout', '0.5'], { encoding: 'utf8', timeout: 15000 })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stdout + result.stderr, /timeout|timed out/)
  assert.equal(readFileSync(path, 'utf8'), before, 'failed proof cannot write a lock')
  assert.equal(existsSync(join(root, 'injected')), false)
})

test('a timeout under injection cannot be recorded as a watched assertion failure', async t => {
  const root = mkdtempSync(join(tmpdir(), 'harness-proof-timeout-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'check.mjs'), "import {existsSync} from 'node:fs'; if(existsSync('injected')) setInterval(()=>{},1000)\n")
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' })
  git('init', '-q'); git('add', '.')
  git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture')
  const result = await proveGate(root, {
    id: 'g', severity: 'blocking', command: 'node check.mjs',
    prove_fires_command: 'touch injected', revert_command: 'rm -f injected',
  }, 500)
  assert.equal(result.status, 'error')
  assert.match(result.detail, /timeout|timed out/)
  assert.equal(existsSync(join(root, 'injected')), false, 'revert still runs')
})

for (const [name, command, status] of [
  ['forbidden output is a real gate failure even with exit zero', 'if [ -f injected ]; then printf ERROR; fi', 'ok'],
  ['forbidden output after revert prevents a successful proof', 'if [ -f injected ]; then exit 1; else printf ERROR; fi', 'error'],
]) {
  test(name, async t => {
    const root = mkdtempSync(join(tmpdir(), 'harness-proof-output-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    writeFileSync(join(root, 'tracked'), 'baseline')
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' })
    git('init', '-q'); git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture')
    const result = await proveGate(root, { id: 'g', severity: 'blocking', command,
      prove_fires_command: 'touch injected', revert_command: 'rm -f injected', expect: { forbid: ['ERROR'] } }, 1000)
    assert.equal(result.status, status)
    assert.equal(existsSync(join(root, 'injected')), false)
  })
}
