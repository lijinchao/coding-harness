import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { postmortemProblems } from '../src/documents.mjs'

const RECORD = [
  '## Impact', '', '## Root cause', '', '## Response', '', '## Regression test', '',
  'Regression: test/schema-agreement.test.mjs', '', '## Action items', '',
].join('\n')

test('a postmortem must name a regression that exists', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-postmortem-'))
  mkdirSync(join(dir, 'test'), { recursive: true })
  writeFileSync(join(dir, 'test', 'schema-agreement.test.mjs'), '')
  assert.deepEqual(postmortemProblems(dir, 'docs/postmortems/0001.md', RECORD, new Set()), [])
  const missing = postmortemProblems(dir, 'docs/postmortems/0001.md', RECORD.replace('test/schema-agreement.test.mjs', 'test/missing.mjs'), new Set())
  assert.match(missing[0], /Regression target not found/)
  rmSync(dir, { recursive: true, force: true })
})

test('a postmortem must carry its sections and a regression', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-postmortem-'))
  const problems = postmortemProblems(dir, 'docs/postmortems/0001.md', '## Impact\n', new Set())
  assert.ok(problems.some((problem) => problem.includes('## Root cause')))
  assert.ok(problems.some((problem) => problem.includes('declares no regression')))
  rmSync(dir, { recursive: true, force: true })
})

test('a regression may name a declared gate', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-postmortem-'))
  const record = RECORD.replace('test/schema-agreement.test.mjs', 'tests')
  assert.deepEqual(postmortemProblems(dir, 'docs/postmortems/0001.md', record, new Set(['tests'])), [])
  rmSync(dir, { recursive: true, force: true })
})
