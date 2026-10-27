import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { inspectDelivery } from '../packs/delivery-flow/check.mjs'
import * as checker from '../packs/delivery-flow/check.mjs'
import { inspectDelivery as legacy } from '../dist/packs/delivery-flow/base@0.1.1/check.mjs'
import { runCommandReview } from '../src/command-review.mjs'

const ROOT = resolve(import.meta.dirname, '..')
const CHECKER = resolve(ROOT, 'packs/delivery-flow/check.mjs')
const digest = value => createHash('sha256').update(value).digest('hex')

test('v2 unit extracts stable scenario markers but not fenced examples', () => {
  assert.equal(typeof checker.scenarioIds, 'function')
  assert.deepEqual(checker.scenarioIds('<!-- scenario: AC-ONE -->\n```md\n<!-- scenario: EXAMPLE -->\n```\n~~~\n<!-- scenario: OTHER -->\n~~~\n<!-- scenario: AC-TWO -->'), ['AC-ONE', 'AC-TWO'])
  assert.deepEqual(checker.scenarioIds('<!-- scenario: SAME --><!-- scenario: SAME -->'), ['SAME', 'SAME'])
})

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'delivery-v2-'))
  t.after(() => rmSync(parent, { recursive: true, force: true }))
  const root = join(parent, 'repo'), receipts = join(parent, 'receipts')
  mkdirSync(join(root, 'test'), { recursive: true }); mkdirSync(receipts)
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: 'pipe' }).trim()
  const design = '# Existing product requirement\n<!-- scenario: AC-ONE -->\nThe value is one.\n'
  writeFileSync(join(root, 'requirement.md'), design)
  writeFileSync(join(root, 'value.mjs'), 'export const value = 0\n')
  writeFileSync(join(root, 'test/behavior.mjs'), "import assert from 'node:assert/strict';import {value} from '../value.mjs';assert.equal(value,1,'expected value is one')\n")
  const plan = {
    schema_version: 'coding-harness.delivery/v2', id: 'existing-value', outcome: 'Return one',
    design: 'requirement.md', constraints: ['No external services'],
    scope: ['requirement.md', 'delivery.plan.json', 'test', 'value.mjs'],
    acceptance: [{ id: 'AC-1', scenario: 'AC-ONE', description: 'Value behavior', checks: ['value'] }],
    checks: [{ id: 'value', tier: 'integration', command: 'node test/behavior.mjs', test_files: ['test/behavior.mjs'], expected_failure: 'expected value is one' }],
    tiers: [
      { tier: 'unit', status: 'not_applicable', reason: 'Only a module boundary is changed' },
      { tier: 'integration', status: 'covered', reason: 'A real importing process asserts the result' },
      { tier: 'e2e', status: 'not_applicable', reason: 'No application or packaged operator boundary in this fixture' },
    ],
  }
  const file = join(root, 'delivery.plan.json')
  const write = () => writeFileSync(file, JSON.stringify(plan, null, 2) + '\n')
  write(); git('init', '-q'); git('add', '-A')
  const commit = message => { git('add', '-A'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', message); return git('rev-parse', 'HEAD') }
  const red = commit('frozen behavior test')
  const inspect = options => { write(); return inspectDelivery(file, options) }
  return { root, parent, receipts, git, plan, file, write, commit, red, design, inspect }
}

test('v2 policy binds existing tracked behavior and distinguishes declarations from evidence', t => {
  const f = fixture(t), r = f.inspect()
  assert.equal(r.status, 'planned', r.problems.join('\n'))
  assert.equal(r.schema_version, 'coding-harness.delivery-report/v2')
  assert.equal(r.behavior.path, 'requirement.md')
  assert.equal(r.behavior.sha256, digest(f.design))
  assert.equal(r.behavior.revision, null)
  assert.equal(r.criteria[0].scenario, 'AC-ONE')
  assert.equal(r.tiers.find(tier => tier.tier === 'integration').status, 'not_evaluated')
  assert.equal(r.tiers.find(tier => tier.tier === 'integration').declared_status, 'covered')
  assert.equal(r.verification_complete, false)
  assert.equal(r.authorizes_merge, false)
})

test('v2 policy rejects untracked, escaping, symlink and out-of-scope behavior or plan', t => {
  const f = fixture(t)
  f.plan.scope = ['delivery.plan.json', 'test', 'value.mjs']
  assert.match(f.inspect().problems.join('\n'), /design.*scope|behavior.*scope/)
  f.plan.scope.push('requirement.md')
  writeFileSync(join(f.root, 'untracked.md'), f.design)
  f.plan.design = 'untracked.md'; f.plan.scope.push('untracked.md')
  assert.match(f.inspect().problems.join('\n'), /tracked/)
  f.plan.design = '../outside.md'
  assert.match(f.inspect().problems.join('\n'), /inside|path|repository/)
  f.plan.design = 'requirement.md'
  rmSync(join(f.root, 'requirement.md'))
  symlinkSync(join(f.root, 'value.mjs'), join(f.root, 'requirement.md'))
  assert.match(f.inspect().problems.join('\n'), /regular|symlink/)
  rmSync(join(f.root, 'requirement.md')); writeFileSync(join(f.root, 'requirement.md'), f.design)
  f.plan.scope = ['requirement.md', 'test', 'value.mjs']
  assert.match(f.inspect().problems.join('\n'), /plan.*scope/)
})

test('v2 policy rejects missing and duplicate scenario markers, ignoring fenced examples', t => {
  const f = fixture(t)
  f.plan.acceptance[0].scenario = 'ABSENT'
  assert.match(f.inspect().problems.join('\n'), /scenario.*ABSENT|ABSENT.*scenario/)
  f.plan.acceptance[0].scenario = 'AC-ONE'
  writeFileSync(join(f.root, 'requirement.md'), f.design + '<!-- scenario: AC-ONE -->\n')
  assert.match(f.inspect().problems.join('\n'), /duplicate.*scenario/)
  writeFileSync(join(f.root, 'requirement.md'), '# Example only\n```md\n<!-- scenario: AC-ONE -->\n```\n')
  assert.match(f.inspect().problems.join('\n'), /scenario/)
  writeFileSync(join(f.root, 'requirement.md'), f.design + '```md\n<!-- scenario: AC-ONE -->\n```\n')
  assert.equal(f.inspect().status, 'planned')
})

test('v2 policy requires regular index entries, not only regular working files', t => {
  const f = fixture(t)
  symlinkSync('value.mjs', join(f.root, 'link.md'))
  f.git('add', 'link.md')
  const oid = f.git('ls-files', '--stage', 'link.md').split(' ')[1]
  f.git('update-index', '--cacheinfo', '120000', oid, 'requirement.md')
  assert.match(f.inspect().problems.join('\n'), /tracked regular|index.*regular/)
})

test('v2 policy cannot promote blocked or unevaluated tiers into full verification', t => {
  const f = fixture(t)
  for (const status of ['blocked', 'not_evaluated']) {
    Object.assign(f.plan.tiers[0], { status, reason: 'The required boundary is not yet checked', follow_up: 'Run the named unit boundary before qualification' })
    const planned = f.inspect()
    assert.equal(planned.status, 'planned', planned.problems.join('\n'))
    assert.equal(planned.tiers[0].status, status)
    const r = f.inspect({ stage: 'verified', revision: f.red })
    assert.equal(r.status, 'blocked')
    assert.match(r.problems.join('\n'), new RegExp('unit.*' + status))
    delete f.plan.tiers[0].follow_up
    assert.match(f.inspect().problems.join('\n'), /follow_up/)
  }
})

test('v2 policy rejects contradictory, missing and legacy tier declarations', t => {
  const f = fixture(t), tiers = structuredClone(f.plan.tiers)
  f.plan.tiers[1].status = 'not_applicable'
  assert.match(f.inspect().problems.join('\n'), /not_applicable.*check|check.*not_applicable/)
  f.plan.tiers = tiers.slice(1)
  assert.match(f.inspect().problems.join('\n'), /unit/)
  f.plan.tiers = tiers; f.plan.tiers[0].status = 'covered'
  assert.match(f.inspect().problems.join('\n'), /covered.*check|check.*covered/)
  f.plan.tiers = undefined
  f.plan.tier_waivers = [{ tier: 'unit', reason: 'runner unavailable' }]
  assert.match(f.inspect().problems.join('\n'), /tiers|tier_waivers/)
})

test('v2 policy leaves legacy v1 interpretation explicit and unchanged', t => {
  const f = fixture(t)
  f.plan.schema_version = 'coding-harness.delivery/v1'
  delete f.plan.tiers; delete f.plan.acceptance[0].scenario
  f.plan.scope = ['test', 'value.mjs']
  f.plan.tier_waivers = [{ tier: 'unit', reason: 'runner unavailable' }, { tier: 'e2e', reason: 'not evaluated yet' }]
  f.write()
  const old = legacy(f.file), current = inspectDelivery(f.file)
  assert.equal(old.status, 'planned')
  assert.deepEqual(current, old)
})

test('v2 evidence binds source bytes, plan bytes and real receipts to one candidate', async t => {
  const f = fixture(t)
  await runCommandReview(f.root, f.red, f.plan.checks[0].command, join(f.receipts, 'value.red.json'), {
    onOutput: r => writeFileSync(join(f.receipts, 'value.red.stderr.txt'), r.stderr),
  })
  writeFileSync(join(f.root, 'value.mjs'), 'export const value = 1\n')
  const candidate = f.commit('implement value')
  await runCommandReview(f.root, candidate, f.plan.checks[0].command, join(f.receipts, 'value.green.json'))
  const adapter = join(f.parent, 'harness.mjs'), cli = resolve(ROOT, 'bin/harness.mjs')
  writeFileSync(adapter, `#!/usr/bin/env node\nimport {execFileSync} from 'node:child_process';process.stdout.write(execFileSync(process.execPath,[${JSON.stringify(cli)},...process.argv.slice(2)]))\n`, { mode: 0o755 })
  const options = { stage: 'verified', revision: candidate, receipts: f.receipts, harness: adapter }
  const r = f.inspect(options)
  assert.equal(r.status, 'verified', r.problems.join('\n'))
  assert.equal(r.behavior.revision, candidate)
  assert.equal(r.behavior.sha256, digest(f.design))
  assert.equal(r.verification_complete, true)
  assert.equal(r.tiers[1].status, 'covered')
  assert.equal(r.human_decision, 'pending')
  writeFileSync(join(f.root, 'requirement.md'), f.design + 'Changed failure semantics.\n')
  assert.equal(f.inspect(options).status, 'blocked')
  writeFileSync(join(f.root, 'requirement.md'), f.design)
  f.plan.outcome = 'Uncommitted claim about another behavior'
  assert.equal(f.inspect(options).status, 'blocked')
  assert.equal(f.inspect({ ...options, revision: f.red }).status, 'blocked')
})

test('v2 operator CLI reports tier gaps without claiming completion', t => {
  const f = fixture(t)
  f.plan.tiers[2] = { tier: 'e2e', status: 'blocked', reason: 'Required environment unavailable', follow_up: 'Run the operator boundary with authorized environment' }
  f.write()
  const run = stage => spawnSync(process.execPath, [CHECKER, '--manifest', f.file, '--stage', stage, '--revision', f.red], { encoding: 'utf8', timeout: 15000 })
  const planned = run('planned')
  assert.equal(planned.status, 0, planned.stdout + planned.stderr)
  assert.equal(JSON.parse(planned.stdout).tiers[2].status, 'blocked')
  const verified = run('verified')
  assert.equal(verified.status, 1)
  const r = JSON.parse(verified.stdout)
  assert.equal(r.verification_complete, false)
  assert.equal(r.authorizes_merge, false)
})

test('v2 self adoption uses the pinned new pack and existing behavior source', () => {
  const manifest = JSON.parse(readFileSync(join(ROOT, 'harness.manifest.json')))
  const plan = JSON.parse(readFileSync(join(ROOT, 'delivery.plan.json')))
  assert.equal(manifest.packs.find(pack => pack.id === 'delivery-flow').version, '0.2.0')
  assert.equal(manifest.tool.version, '0.1.49')
  assert.equal(plan.schema_version, 'coding-harness.delivery/v2')
  assert.equal(plan.design, 'docs/changes/wisharness-spec-adoption/spec.md')
  assert.ok(plan.acceptance.every(criterion => typeof criterion.scenario === 'string'))
})
