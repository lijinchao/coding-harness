import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { SHIM } from '../src/shim.mjs'
import { toolRoot } from '../src/tool.mjs'

const tool = toolRoot()

test('the committed bootstrap matches the template the tool ships', () => {
  const committed = readFileSync(resolve(tool, 'harness'), 'utf8')
  assert.equal(committed, SHIM)
})

test('the bootstrap resolves the manifest next to itself, not the current directory', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-shim-'))
  const elsewhere = mkdtempSync(join(tmpdir(), 'coding-harness-cwd-'))
  const shim = join(dir, 'harness')
  writeFileSync(shim, SHIM)
  chmodSync(shim, 0o755)
  writeFileSync(join(dir, 'harness.manifest.json'), JSON.stringify({
    version: '0.0.0',
    tool: { version: '0.0.0', source: join(tool, 'README.md') },
    compositions: [],
    skills: [],
    gates: [],
  }, null, 2) + '\n')
  const output = execFileSync(shim, ['--help'], { cwd: elsewhere, encoding: 'utf8' })
  assert.match(output, /usage: harness/)
  rmSync(dir, { recursive: true, force: true })
  rmSync(elsewhere, { recursive: true, force: true })
})
