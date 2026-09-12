import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { discoverInstructionFiles, documentProblems, headingSlug, instructionProblems, linkProblems } from '../src/documents.mjs'

function repo() {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-docs-'))
  mkdirSync(join(dir, 'docs'), { recursive: true })
  return dir
}

test('headingSlug matches a Markdown anchor', () => {
  assert.equal(headingSlug('Check the governance facts'), 'check-the-governance-facts')
  assert.equal(headingSlug('has: punctuation!'), 'has-punctuation')
})

test('linkProblems resolves relative targets and anchors and skips fences', () => {
  const dir = repo()
  writeFileSync(join(dir, 'docs', 'target.md'), '# The target\n')
  const text = [
    '# The target',
    '[ok](target.md#the-target)',
    '[own](#the-target)',
    '[bad](missing.md)',
    '[anchor](target.md#nope)',
    '[web](https://example.invalid/x)',
    '```',
    '[fenced](missing-too.md)',
    '```',
  ].join('\n')
  assert.deepEqual(linkProblems(dir, 'docs/links.md', text), [
    'docs/links.md: link target not found: missing.md',
    'docs/links.md: anchor not found: target.md#nope',
  ])
  rmSync(dir, { recursive: true, force: true })
})

test('documentProblems checks budgets and missing files', () => {
  const dir = repo()
  writeFileSync(join(dir, 'README.md'), 'one two three four five\n')
  const problems = documentProblems(dir, [{ path: 'README.md', maxWords: 3 }, { path: 'MISSING.md' }])
  assert.ok(problems.some((problem) => problem.includes('exceeds the budget of 3')))
  assert.ok(problems.some((problem) => problem.includes('file not found')))
  rmSync(dir, { recursive: true, force: true })
})

test('instructionProblems requires every instruction file to be declared', () => {
  const dir = repo()
  writeFileSync(join(dir, 'AGENTS.md'), '# Root\n')
  mkdirSync(join(dir, 'packages', 'api'), { recursive: true })
  writeFileSync(join(dir, 'packages', 'api', 'AGENTS.md'), '# Api\n')
  assert.deepEqual(discoverInstructionFiles(dir), ['AGENTS.md', 'packages/api/AGENTS.md'])
  assert.deepEqual(instructionProblems(dir, ['AGENTS.md']), ['packages/api/AGENTS.md: unmanaged instruction file; declare it under governance.instructions'])
  assert.deepEqual(instructionProblems(dir, ['AGENTS.md', 'packages/*/AGENTS.md']), [])
  assert.ok(instructionProblems(dir, ['AGENTS.md', 'apps/*/AGENTS.md']).some((problem) => problem.includes('matches no instruction file')))
  rmSync(dir, { recursive: true, force: true })
})

test('the real documentation passes the declared checks', () => {
  const root = join(import.meta.dirname, '..')
  const manifest = JSON.parse(readFileSync(join(root, 'harness.manifest.json'), 'utf8'))
  assert.deepEqual(documentProblems(root, manifest.governance.docs), [])
})
