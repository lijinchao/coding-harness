import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { renderSystemCiTemplate, SYSTEM_CI_LAYOUT } from '../src/system-ci-template.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

for (const provider of ['github', 'gitlab']) test(provider + ' system CI scaffold is Shadow-only and archives the shared layout', () => {
  const text = renderSystemCiTemplate(provider)
  assert.match(text, /system-ci --manifest system\.manifest\.json/)
  assert.match(text, new RegExp(SYSTEM_CI_LAYOUT.receipts.replaceAll('.', '\\.')))
  assert.match(text, new RegExp(SYSTEM_CI_LAYOUT.history.replaceAll('.', '\\.')))
  assert.match(text, new RegExp(SYSTEM_CI_LAYOUT.current.replaceAll('.', '\\.')))
  assert.match(text, /always/)
  assert.match(text, /Restore earlier reports/)
  assert.match(text, /checkout paths|checkout steps/)
  assert.doesNotMatch(text, /--enforce/)
})

test('system-ci-template prints by default and refuses accidental overwrite', () => {
  const printed = spawnSync(process.execPath, [CLI, 'system-ci-template', '--provider', 'github'], { encoding: 'utf8' })
  assert.equal(printed.status, 0)
  assert.equal(printed.stdout, renderSystemCiTemplate('github'))
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-system-ci-template-'))
  const out = join(root, 'shadow.yml')
  const first = spawnSync(process.execPath, [CLI, 'system-ci-template', '--provider', 'gitlab', '--out', out], { encoding: 'utf8' })
  assert.equal(first.status, 0)
  assert.equal(readFileSync(out, 'utf8'), renderSystemCiTemplate('gitlab'))
  const refused = spawnSync(process.execPath, [CLI, 'system-ci-template', '--provider', 'github', '--out', out], { encoding: 'utf8' })
  assert.equal(refused.status, 1)
  assert.match(refused.stderr, /already exists/)
  const forced = spawnSync(process.execPath, [CLI, 'system-ci-template', '--provider', 'github', '--out', out, '--force'], { encoding: 'utf8' })
  assert.equal(forced.status, 0)
  assert.equal(readFileSync(out, 'utf8'), renderSystemCiTemplate('github'))
  rmSync(root, { recursive: true, force: true })
})

test('system-ci-template rejects an unknown provider', () => {
  const result = spawnSync(process.execPath, [CLI, 'system-ci-template', '--provider', 'jenkins'], { encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /provider must be github or gitlab/)
})
