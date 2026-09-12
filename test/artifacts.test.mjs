import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { skillProblems } from '../src/artifacts.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function run(args) {
  return execFileSync(process.execPath, [CLI, ...args], { encoding: 'utf8' })
}

function manifestPath(dir) {
  return join(dir, 'harness.manifest.json')
}

const GOOD = ['---', 'name: x', 'description: use when y', '---', '', '# X', '', '## Inputs', '', '- a', '', '## Steps', '', '1. b', '', '## Verification', '', '- c', '', '## Failure', '', '- d', ''].join('\n')

test('a skill with every required section has no problems', () => {
  assert.deepEqual(skillProblems(GOOD), [])
})

test('a skill missing its verification section reports it', () => {
  const bad = GOOD.replace('## Verification', '## Something else')
  assert.ok(skillProblems(bad).some((problem) => problem.includes('## Verification')))
})

function makeRepo(skillText) {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-artifacts-'))
  const base = join(root, 'base')
  const consumer = join(root, 'consumer')
  mkdirSync(join(base, 'skills', 'x'), { recursive: true })
  mkdirSync(consumer)
  writeFileSync(join(base, 'AGENTS.base.md'), '# Base\n')
  writeFileSync(join(base, 'skills', 'x', 'SKILL.md'), skillText)
  run(['release', '--base', base, '--out', join(root, 'dist'), '--version', '0.1.0'])
  writeFileSync(manifestPath(consumer), JSON.stringify({
    version: '0.1.0',
    base: { source: '../dist' },
    compositions: [{ output: 'AGENTS.md', sources: ['base:AGENTS.base.md'] }],
    skills: [{ id: 'x', path: 'base:skills/x/SKILL.md', trigger: 't', owner: 'o' }],
    gates: [{ id: 'g', command: './harness check', protects: 'p', prove_fires: 'f', severity: 'blocking' }],
  }, null, 2) + '\n')
  return { root, consumer }
}

test('validate passes a skill with every section', () => {
  const { root, consumer } = makeRepo(GOOD)
  run(['validate', '--manifest', manifestPath(consumer)])
  rmSync(root, { recursive: true, force: true })
})

test('validate fails a skill missing its verification section', () => {
  const { root, consumer } = makeRepo(GOOD.replace('## Verification', '## Elsewhere'))
  assert.throws(() => run(['validate', '--manifest', manifestPath(consumer)]))
  rmSync(root, { recursive: true, force: true })
})

test('the base ships decision-record and postmortem templates', () => {
  assert.ok(existsSync(resolve(import.meta.dirname, '../base/templates/decision-record.md')))
  assert.ok(existsSync(resolve(import.meta.dirname, '../base/templates/postmortem.md')))
})
