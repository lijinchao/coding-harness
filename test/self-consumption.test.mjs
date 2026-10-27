import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { documentProblems } from '../src/documents.mjs'

const root = resolve(import.meta.dirname, '..')
const read = path => readFileSync(resolve(root, path), 'utf8')
const manifest = JSON.parse(read('harness.manifest.json'))

function checkDocument(t, declaration, body) {
  const temporary = mkdtempSync(join(tmpdir(), 'self-consumption-doc-'))
  t.after(() => rmSync(temporary, { recursive: true, force: true }))
  if (body !== undefined) {
    const file = join(temporary, declaration.path)
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, body)
  }
  return documentProblems(temporary, [declaration])
}

test('self-consumption policy: retain document checks without non-entry hard budgets', t => {
  const docs = manifest.governance.docs
  assert.ok(docs.length >= 23, 'retain the declared documents without forbidding future unbudgeted sources')
  const budgeted = docs.filter(doc => doc.maxWords !== undefined || doc.maxBytes !== undefined)
  assert.deepEqual(budgeted, [
    { path: 'AGENTS.md', maxBytes: 8192 },
    { path: 'docs/index.md', maxBytes: 4096 },
  ])
  const reference = docs.find(doc => doc.path === 'docs/reference.md')
  assert.deepEqual(checkDocument(t, reference, 'word '.repeat(1601)), [])
  assert.match(checkDocument(t, reference).join('\n'), /file not found/)
  assert.match(checkDocument(t, reference, '[missing](absent.md)').join('\n'), /link target not found/)
  for (const doc of budgeted) assert.match(checkDocument(t, doc, 'x'.repeat(doc.maxBytes + 1)).join('\n'), /exceeds the budget/)
})

test('self-consumption policy: historical metrics are advisory, current CI reports its own run', () => {
  const gate = manifest.gates.find(gate => gate.id === 'metrics')
  assert.equal(gate.severity, 'advisory')
  assert.match(gate.command, /historical gate-health/)
  assert.match(gate.command, /harness metrics --manifest harness\.manifest\.json/)
  assert.equal(manifest.governance.metrics.log, 'docs/metrics.jsonl')
  const workflow = read('.github/workflows/harness.yml')
  assert.match(workflow, /gates --manifest harness\.manifest\.json --report \.harness\/gates\.jsonl/)
  assert.match(workflow, /metrics --log \.harness\/gates\.jsonl/)
})

test('self-consumption policy: receipt smoke is explicitly not delivery qualification', () => {
  const script = read('scripts/check-command-review.mjs')
  assert.match(script, /mechanism smoke only/)
  assert.match(script, /not delivery qualification/)
  assert.match(script, /'--command', 'true'/)
  assert.match(script, /fixture\.command/)
})

test('self-consumption policy: use existing work without a task quota and isolate before staging', () => {
  for (const path of ['docs/direction.md', 'docs/roadmap.md', 'docs/governance-cost-review.md', 'docs/decisions/0052-evidence-first-delivery.md']) {
    assert.doesNotMatch(read(path), /Three real delivery tasks|Observe three real deliveries|On three separately|Choose three separately/, path)
  }
  assert.match(read('AGENTS.delta.md'), /isolate before staging/)
})

test('operator delivery preflight names current criteria and does not claim verification', () => {
  const result = spawnSync(process.execPath, ['scripts/check-delivery.mjs', '--manifest', 'delivery.plan.json', '--stage', 'planned'], { cwd: root, encoding: 'utf8', timeout: 15000 })
  assert.equal(result.status, 0, result.stdout + result.stderr)
  const report = JSON.parse(result.stdout)
  const plan = JSON.parse(read('delivery.plan.json'))
  assert.notEqual(plan.id, 'checker-inputs-and-offline-resolution', 'the previous task is historical, not the active acceptance map')
  assert.equal(report.design, plan.design)
  assert.deepEqual(report.criteria.map(criterion => criterion.id), plan.acceptance.map(criterion => criterion.id))
  assert.equal(report.status, 'planned')
  assert.ok(report.criteria.every(criterion => criterion.evidence === 'pending'))
  assert.equal(report.human_decision, 'pending')
  assert.equal(report.authorizes_merge, false)
})
