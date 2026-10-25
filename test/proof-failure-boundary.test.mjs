import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { proveGate } from '../src/prove.mjs'

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
