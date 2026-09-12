import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { decisionProblems } from '../src/documents.mjs'
import { productProblems } from '../src/product.mjs'

test('the product version has one source and the mentions must agree', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-product-'))
  writeFileSync(join(dir, 'VERSION'), '0.1.0-pre.11\n')
  writeFileSync(join(dir, 'README.md'), 'Status: 0.1.0-pre.9\n')
  assert.deepEqual(productProblems(dir, { version: { path: 'VERSION' }, mentions: ['README.md'] }), ['README.md: does not mention the product version 0.1.0-pre.11'])
  writeFileSync(join(dir, 'README.md'), 'Status: v0.1.0-pre.11\n')
  assert.deepEqual(productProblems(dir, { version: { path: 'VERSION' }, mentions: ['README.md'] }), [])
  rmSync(dir, { recursive: true, force: true })
})

test('a version file that carries prose needs a pattern', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-product-'))
  writeFileSync(join(dir, 'VERSION'), 'project: unversioned\ncoding-harness: v0.1.15\n')
  assert.ok(productProblems(dir, { version: { path: 'VERSION' } })[0].includes('whole file must be one version'))
  assert.deepEqual(productProblems(dir, { version: { path: 'VERSION', pattern: '^project:\\s*(\\S+)$' }, mentions: [] }), [])
  rmSync(dir, { recursive: true, force: true })
})

test('a decision record states its lifecycle status', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-product-'))
  assert.deepEqual(decisionProblems(dir, 'docs/decisions/0001.md', '# 0001 — x\n\nStatus: implemented\n\n## Problem\n'), [])
  assert.deepEqual(decisionProblems(dir, 'docs/decisions/0001.md', '# 0001 — x\n\n## Status\n\nproposed\n\n## Problem\n'), [])
  assert.ok(decisionProblems(dir, 'docs/decisions/0001.md', '# 0001 — x\n\n## Problem\n')[0].includes('missing status'))
  assert.ok(decisionProblems(dir, 'docs/decisions/0001.md', '# 0001 — x\n\nStatus: done\n')[0].includes('must be one of'))
  rmSync(dir, { recursive: true, force: true })
})

test('a superseded decision must name its replacement, which must exist', () => {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-product-'))
  mkdirSync(join(dir, 'docs', 'decisions'), { recursive: true })
  writeFileSync(join(dir, 'docs', 'decisions', 'target.md'), '# x\n')
  const text = '# 0001 — x\n\nStatus: superseded\n\nSuperseded-by: target.md\n'
  assert.deepEqual(decisionProblems(dir, 'docs/decisions/0001.md', text), [])
  assert.ok(decisionProblems(dir, 'docs/decisions/0001.md', text.replace('target.md', 'missing.md'))[0].includes('target not found'))
  assert.ok(decisionProblems(dir, 'docs/decisions/0001.md', '# 0001 — x\n\nStatus: superseded\n')[0].includes('must declare Superseded-by'))
  rmSync(dir, { recursive: true, force: true })
})
