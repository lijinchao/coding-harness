import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { runCommandReview } from '../src/command-review.mjs'

test('evidence binds frozen tests, expected failure, revision, scope, and a separate human decision', async (t) => {
  const home = mkdtempSync(join(tmpdir(), 'delivery-evidence-'))
  t.after(() => rmSync(home, { recursive: true, force: true }))
  const root = join(home, 'repo')
  const receipts = join(home, 'receipts')
  mkdirSync(join(root, 'test'), { recursive: true }); mkdirSync(receipts)
  const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' }).toString().trim()
  const commit = (message) => { git('add', '-A'); git('-c', 'user.name=Test', '-c', 'user.email=test@example.test', 'commit', '-qm', message); return git('rev-parse', 'HEAD') }
  writeFileSync(join(root, 'design.md'), '# Expected value\n')
  writeFileSync(join(root, 'value.mjs'), 'export const value = 0\n')
  writeFileSync(join(root, 'test', 'value.mjs'), "import assert from 'node:assert/strict'; import {value} from '../value.mjs'; assert.equal(value, 1, 'expected value is one');\n")
  const plan = {
    schema_version: 'coding-harness.delivery/v1', id: 'value', outcome: 'Return one', design: 'design.md', constraints: ['Offline'], scope: ['test', 'value.mjs'],
    acceptance: [{ id: 'AC-1', description: 'The value is one', checks: ['value'] }],
    checks: [{ id: 'value', tier: 'integration', command: 'node test/value.mjs', test_files: ['test/value.mjs'], expected_failure: 'expected value is one' }],
    tier_waivers: [{ tier: 'unit', reason: 'Module seam exercised by one process' }, { tier: 'e2e', reason: 'No packaged application' }],
  }
  const manifest = join(root, 'delivery.plan.json')
  writeFileSync(manifest, JSON.stringify(plan))
  git('init', '-q')
  const redRevision = commit('red')
  await runCommandReview(root, redRevision, plan.checks[0].command, join(receipts, 'value.red.json'), {
    onOutput: (result) => writeFileSync(join(receipts, 'value.red.stderr.txt'), result.stderr),
  })
  writeFileSync(join(root, 'value.mjs'), 'export const value = 1\n')
  const revision = commit('green')
  await runCommandReview(root, revision, plan.checks[0].command, join(receipts, 'value.green.json'))
  const { inspectDelivery } = await import(pathToFileURL(resolve(import.meta.dirname, '../packs/delivery-flow/check.mjs')))
  const adapter = join(home, 'harness-adapter.mjs')
  const cli = resolve(import.meta.dirname, '../bin/harness.mjs')
  writeFileSync(adapter, `#!/usr/bin/env node\nimport {execFileSync} from 'node:child_process'; process.stdout.write(execFileSync(process.execPath, [${JSON.stringify(cli)}, ...process.argv.slice(2)]));\n`, { mode: 0o755 })
  const options = { stage: 'verified', revision, receipts, harness: adapter }
  const result = inspectDelivery(manifest, options)
  assert.equal(result.status, 'verified', result.problems.join('\n'))
  assert.equal(result.human_decision, 'pending')
  assert.equal(result.authorizes_merge, false)
  assert.equal(inspectDelivery(manifest, { ...options, stage: 'accepted' }).status, 'blocked')
  const approval = join(home, 'approval.json')
  writeFileSync(approval, JSON.stringify({ decision: 'accepted', reviewed_by: 'fixture-owner', revision, plan_sha256: result.plan_sha256, evidence: 'fixture-only review reference' }))
  const recorded = inspectDelivery(manifest, { ...options, stage: 'accepted', approval })
  assert.equal(recorded.status, 'acceptance-recorded')
  assert.equal(recorded.reviewer_identity_authenticated, false)
  assert.equal(recorded.authorizes_merge, false)
  writeFileSync(join(root, 'value.mjs'), 'export const value = 2\n')
  assert.match(inspectDelivery(manifest, options).problems.join('\n'), /scope changed/)
  writeFileSync(join(root, 'value.mjs'), 'export const value = 1\n')
  writeFileSync(join(receipts, 'value.red.stderr.txt'), 'forged expected value is one')
  assert.match(inspectDelivery(manifest, options).problems.join('\n'), /diagnostic does not match/)
  const green = JSON.parse(readFileSync(join(receipts, 'value.green.json'), 'utf8'))
  green.result.timed_out = true
  writeFileSync(join(receipts, 'value.green.json'), JSON.stringify(green))
  assert.equal(inspectDelivery(manifest, options).status, 'blocked')
})
