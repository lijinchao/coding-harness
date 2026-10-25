import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync, execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { win32 } from 'node:path'
import * as checkerModule from '../packs/delivery-flow/check.mjs'

const CHECKER = resolve(import.meta.dirname, '../packs/delivery-flow/check.mjs')

test('the standalone pack rejects Windows realpath escapes', () => {
  assert.equal(checkerModule.inside('C:\\repo', 'C:\\other\\plan.json', win32), false)
  assert.equal(checkerModule.inside('C:\\repo', 'C:\\repo\\plan.json', win32), true)
})

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'delivery-flow-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'test'))
  writeFileSync(join(root, 'design.md'), '# Accepted scope\n')
  writeFileSync(join(root, 'test', 'behavior.mjs'), 'process.exit(0)\n')
  const plan = {
    schema_version: 'coding-harness.delivery/v1', id: 'sample',
    outcome: 'An owner can identify the evidence for a delivered behavior.',
    design: 'design.md', constraints: ['No new dependencies.'],
    scope: ['test'],
    acceptance: [{ id: 'AC-01', description: 'The behavior check passes.', checks: ['behavior'] }],
    checks: [{ id: 'behavior', tier: 'integration', command: 'node test/behavior.mjs', test_files: ['test/behavior.mjs'] }],
    tier_waivers: [{ tier: 'unit', reason: 'This slice tests a real CLI seam.' }, { tier: 'e2e', reason: 'No packaged application is delivered in this fixture.' }],
  }
  const run = (stage = 'planned', extra = []) => {
    writeFileSync(join(root, 'delivery.plan.json'), JSON.stringify(plan, null, 2) + '\n')
    const result = spawnSync(process.execPath, [CHECKER, '--manifest', join(root, 'delivery.plan.json'), '--stage', stage, ...extra], { encoding: 'utf8' })
    assert.doesNotMatch(result.stderr, /ERR_MODULE_NOT_FOUND|Cannot find module/, 'the checker must exist before interpreting a test failure')
    return { ...result, report: result.stdout ? JSON.parse(result.stdout) : null }
  }
  return { root, plan, run }
}

test('a mapped plan is ready for work but never claims human acceptance', (t) => {
  const f = fixture(t)
  const r = f.run()
  assert.equal(r.status, 0, r.stderr)
  assert.equal(r.report.status, 'planned')
  assert.equal(r.report.human_decision, 'pending')
  assert.equal(r.report.authorizes_merge, false)
  assert.equal(r.report.criteria[0].id, 'AC-01')
})

test('missing criteria, dangling checks, unaddressed tiers, and path escapes fail closed', (t) => {
  const f = fixture(t)
  const initial = structuredClone(f.plan)
  for (const change of [
    (p) => { p.acceptance = [] },
    (p) => { p.acceptance[0].checks = ['unknown'] },
    (p) => { p.tier_waivers = [] },
    (p) => { p.design = '../outside.md' },
    (p) => { p.checks[0].test_files = ['missing.mjs'] },
    (p) => { p.outcome = '' },
    (p) => { p.unrecognized = true },
  ]) {
    Object.assign(f.plan, structuredClone(initial))
    delete f.plan.unrecognized
    change(f.plan)
    const r = f.run()
    assert.equal(r.status, 1, JSON.stringify(f.plan))
    assert.ok(r.report.problems.length > 0)
  }
})

test('a verified stage cannot be satisfied by a green declaration alone', (t) => {
  const f = fixture(t)
  const r = f.run('verified')
  assert.equal(r.status, 1)
  assert.match(r.report.problems.join('\n'), /revision|receipt/)
  assert.equal(r.report.human_decision, 'pending')
})

test('the plan checker never executes the test command', (t) => {
  const f = fixture(t)
  f.plan.checks[0].command = 'touch should-not-exist'
  assert.equal(f.run().status, 0)
  assert.throws(() => readFileSync(join(f.root, 'should-not-exist')))
})

test('unknown stages and malformed input produce a failed report', (t) => {
  const f = fixture(t)
  assert.equal(f.run('invented').status, 1)
  writeFileSync(join(f.root, 'broken.json'), '{')
  const r = spawnSync(process.execPath, [CHECKER, '--manifest', join(f.root, 'broken.json')], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.ok(JSON.parse(r.stdout).problems.length)
})

test('the released pack composes, fails on a broken plan, reverts, and runs repeatedly', (t) => {
  const f = fixture(t)
  const cli = resolve(import.meta.dirname, '../bin/harness.mjs')
  const registry = join(f.root, 'registry')
  const runCli = (args) => execFileSync(process.execPath, [cli, ...args], { encoding: 'utf8' })
  runCli(['release', '--base', resolve(import.meta.dirname, '../packs/delivery-flow'), '--out', registry, '--version', '0.1.0'])
  mkdirSync(join(f.root, 'scripts'))
  const released = join(registry, 'base@0.1.0', 'check.mjs')
  writeFileSync(join(f.root, 'scripts', 'check-delivery.mjs'), `import { main } from ${JSON.stringify(new URL('file://' + released).href)}; main();\n`)
  writeFileSync(join(f.root, 'AGENTS.delta.md'), '# Fixture\n')
  const manifest = join(f.root, 'harness.manifest.json')
  writeFileSync(manifest, JSON.stringify({ version: '0.1.41', compositions: [{ output: 'AGENTS.md', sources: ['AGENTS.delta.md'] }], skills: [], gates: [], packs: [{ id: 'delivery-flow', version: '0.1.0', source: registry }] }))
  f.run()
  runCli(['sync', '--manifest', manifest])
  const git = (...args) => execFileSync('git', ['-C', f.root, ...args], { stdio: 'pipe' })
  git('init', '-q'); git('add', '-A'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', 'fixture')
  for (let i = 0; i < 2; i++) assert.match(runCli(['gates', '--manifest', manifest]), /ok\tdelivery-flow\/plan/)
  assert.match(runCli(['prove', '--manifest', manifest, '--timeout', '20']), /ok\tdelivery-flow\/plan\tfired/)
  assert.equal(git('status', '--porcelain').toString(), '')
})
