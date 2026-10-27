import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { inspectDelivery } from '../packs/delivery-flow/check.mjs'

test('v2 boundary rejects inherited property names in closed objects', t => {
  const root = mkdtempSync(join(tmpdir(), 'delivery-v2-closed-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  writeFileSync(join(root, 'design.md'), '<!-- scenario: AC-ONE -->\nExpected result\n')
  writeFileSync(join(root, 'test.mjs'), 'process.exit(0)\n')
  const plan = {
    schema_version: 'coding-harness.delivery/v2', id: 'boundary', outcome: 'Closed input',
    design: 'design.md', constraints: ['Offline'], scope: ['design.md', 'plan.json', 'test.mjs'],
    acceptance: [{ id: 'AC', scenario: 'AC-ONE', description: 'Boundary', checks: ['test'] }],
    checks: [{ id: 'test', tier: 'unit', command: 'node test.mjs', test_files: ['test.mjs'] }],
    tiers: [{ tier: 'unit', status: 'covered', reason: 'Pure boundary check' }, { tier: 'integration', status: 'not_applicable', reason: 'No external boundary in fixture' }, { tier: 'e2e', status: 'not_applicable', reason: 'No application in fixture' }],
  }
  const file = join(root, 'plan.json')
  writeFileSync(file, JSON.stringify(plan))
  execFileSync('git', ['init', '-q', root]); execFileSync('git', ['-C', root, 'add', '-A'])
  for (const name of ['constructor', 'toString', '__proto__']) {
    for (const select of [p => p, p => p.acceptance[0], p => p.tiers[0]]) {
      const changed = structuredClone(plan)
      Object.defineProperty(select(changed), name, { value: 'unrecognized', enumerable: true })
      writeFileSync(file, JSON.stringify(changed))
      const r = inspectDelivery(file)
      assert.equal(r.status, 'blocked', 'unexpected inherited name must fail: ' + name)
      assert.match(r.problems.join('\n'), /unknown field/)
    }
  }
})
