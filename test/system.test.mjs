import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  SYSTEM_CONTRACT_KEYS,
  SYSTEM_EVIDENCE_KEYS,
  SYSTEM_RECEIPT_KEYS,
  SYSTEM_RECEIPT_MANIFEST_KEYS,
  SYSTEM_RECEIPT_REPOSITORY_KEYS,
  SYSTEM_RECEIPT_RESULT_KEYS,
  SYSTEM_RECEIPT_STREAM_KEYS,
  SYSTEM_QUALIFICATION_KEYS,
  SYSTEM_PROMOTION_KEYS,
  SYSTEM_REPOSITORY_KEYS,
  SYSTEM_ROOT_KEYS,
  SYSTEM_VERIFICATION_KEYS,
  checkSystemManifest,
  checkSystemReceipt,
  runSystemTier,
  systemCiReport,
  validateSystemManifest,
  validateSystemReceipt,
} from '../src/system.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')
const SCHEMA = JSON.parse(readFileSync(resolve(import.meta.dirname, '../schema/system.manifest.schema.json'), 'utf8'))
const RECEIPT_SCHEMA = JSON.parse(readFileSync(resolve(import.meta.dirname, '../schema/system-receipt.schema.json'), 'utf8'))

function commit(root, message = 'fixture') {
  execFileSync('git', ['init', '-q'], { cwd: root })
  execFileSync('git', ['add', '-A'], { cwd: root })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', message], { cwd: root })
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-system-'))
  const control = join(root, 'control')
  const runtime = join(root, 'runtime')
  mkdirSync(join(control, 'docs'), { recursive: true })
  mkdirSync(runtime)
  writeFileSync(join(control, 'docs', 'runtime-contract.md'), '# Runtime contract\n')
  writeFileSync(join(runtime, 'main.js'), 'export const ready = true\n')
  const controlRevision = commit(control)
  const runtimeRevision = commit(runtime)
  const marker = join(root, 'executed')
  const manifestPath = join(root, 'system.manifest.json')
  const manifest = {
    schema_version: 'coding-harness.system/v1',
    id: 'demo-system',
    repositories: [
      { id: 'control', role: 'contracts and governance', path: 'control', revision: controlRevision },
      { id: 'runtime', role: 'runtime implementation', path: 'runtime', revision: runtimeRevision },
    ],
    contracts: [{
      id: 'runtime-api',
      producer: 'runtime',
      consumers: ['control'],
      evidence: { repository: 'control', path: 'docs/runtime-contract.md' },
    }],
    verifications: [
      { id: 'control-check', repository: 'control', tier: 'harness-check', command: `touch ${marker}`, external: false, reviewed_by: '@owner' },
      { id: 'runtime-unit', repository: 'runtime', tier: 'unit', command: 'node --test', external: false, reviewed_by: '@owner' },
    ],
    qualification: {
      required_tiers: ['unit'],
      max_receipt_age_seconds: 3600,
      promotion: {
        history_window: 5,
        minimum_runs: 1,
        minimum_healthy_rate: 1,
        minimum_consecutive_healthy_runs: 1,
      },
    },
  }
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')
  return { root, control, runtime, marker, manifest, manifestPath }
}

test('system check proves snapshot alignment without executing reviewed commands', () => {
  const value = fixture()
  const report = checkSystemManifest(value.manifestPath)
  assert.equal(report.structural.valid, true)
  assert.equal(report.ready, true)
  assert.equal(report.qualification.status, 'declared-ready')
  assert.equal(report.qualification.commands_executed, false)
  assert.ok(report.repositories.every((entry) => entry.revision_match && entry.clean))
  assert.equal(report.contracts[0].evidence_exists, true)
  assert.ok(report.verifications.every((entry) => entry.reviewed && entry.executable_resolvable && !entry.executed))
  assert.equal(existsSync(value.marker), false)
  rmSync(value.root, { recursive: true, force: true })
})

test('system check fails closed on revision drift, dirty state, and missing evidence', () => {
  const value = fixture()
  writeFileSync(join(value.runtime, 'dirty.txt'), 'dirty\n')
  value.manifest.contracts[0].evidence.path = 'docs/missing.md'
  value.manifest.repositories[0].revision = '0'.repeat(40)
  value.manifest.verifications[1].command = './missing-check'
  writeFileSync(value.manifestPath, JSON.stringify(value.manifest, null, 2) + '\n')
  const result = spawnSync(process.execPath, [CLI, 'system-check', '--manifest', value.manifestPath], { encoding: 'utf8' })
  const report = JSON.parse(result.stdout)
  assert.equal(result.status, 1)
  assert.equal(report.ready, false)
  assert.equal(report.repositories.find((entry) => entry.id === 'control').revision_match, false)
  assert.equal(report.repositories.find((entry) => entry.id === 'runtime').clean, false)
  assert.equal(report.contracts[0].evidence_exists, false)
  assert.equal(report.verifications.find((entry) => entry.id === 'runtime-unit').executable_resolvable, false)
  rmSync(value.root, { recursive: true, force: true })
})

test('system validator rejects unreviewed, wildcard, external, and dangling declarations', () => {
  const value = fixture()
  value.manifest.repositories.push({ id: 'desktop', role: 'client', path: 'desktop', revision: '1'.repeat(40) })
  value.manifest.contracts[0].consumers = ['missing']
  value.manifest.verifications[0].command = 'python scripts/run_*_gate.py'
  value.manifest.verifications[0].reviewed_by = ''
  value.manifest.verifications[1].command = 'curl https://example.test'
  const issues = validateSystemManifest(value.manifest).join('\n')
  assert.match(issues, /unknown repository missing/)
  assert.match(issues, /wildcards are not executable command arguments/)
  assert.match(issues, /reviewed_by: required non-empty string/)
  assert.match(issues, /external-service signal/)
  assert.match(issues, /desktop.*has no reviewed verification/)
  rmSync(value.root, { recursive: true, force: true })
})

test('system validator rejects unusable freshness and promotion budgets', () => {
  const value = fixture()
  value.manifest.qualification.max_receipt_age_seconds = 0
  value.manifest.qualification.promotion = {
    history_window: 2,
    minimum_runs: 3,
    minimum_healthy_rate: 1.1,
    minimum_consecutive_healthy_runs: 4,
  }
  const issues = validateSystemManifest(value.manifest).join('\n')
  assert.match(issues, /max_receipt_age_seconds: required integer >= 1/)
  assert.match(issues, /minimum_runs: cannot exceed history_window/)
  assert.match(issues, /minimum_healthy_rate: required number from 0 to 1/)
  assert.match(issues, /minimum_consecutive_healthy_runs: cannot exceed history_window/)
  rmSync(value.root, { recursive: true, force: true })
})

test('an unresolved repository is explicit, structurally valid, and never ready', () => {
  const value = fixture()
  value.manifest.repositories.push({ id: 'desktop', role: 'client', path: 'missing-desktop', revision: null })
  value.manifest.verifications.push({
    id: 'desktop-build', repository: 'desktop', tier: 'unit', command: 'npm run build', external: false, reviewed_by: '@owner',
  })
  writeFileSync(value.manifestPath, JSON.stringify(value.manifest, null, 2) + '\n')
  const report = checkSystemManifest(value.manifestPath)
  assert.equal(report.structural.valid, true)
  assert.equal(report.ready, false)
  assert.deepEqual(report.repositories.find((entry) => entry.id === 'desktop'), {
    id: 'desktop',
    role: 'client',
    declared_path: 'missing-desktop',
    path: join(value.root, 'missing-desktop'),
    exists: false,
    git: false,
    expected_revision: null,
    current_revision: null,
    revision_match: false,
    clean: false,
    change_count: 0,
  })
  rmSync(value.root, { recursive: true, force: true })
})

test('system schema and executable validator expose the same object fields', () => {
  assert.deepEqual([...SYSTEM_ROOT_KEYS].sort(), Object.keys(SCHEMA.properties).sort())
  assert.deepEqual([...SYSTEM_REPOSITORY_KEYS].sort(), Object.keys(SCHEMA.properties.repositories.items.properties).sort())
  assert.deepEqual([...SYSTEM_CONTRACT_KEYS].sort(), Object.keys(SCHEMA.properties.contracts.items.properties).sort())
  assert.deepEqual([...SYSTEM_EVIDENCE_KEYS].sort(), Object.keys(SCHEMA.properties.contracts.items.properties.evidence.properties).sort())
  assert.deepEqual([...SYSTEM_VERIFICATION_KEYS].sort(), Object.keys(SCHEMA.properties.verifications.items.properties).sort())
  assert.deepEqual([...SYSTEM_QUALIFICATION_KEYS].sort(), Object.keys(SCHEMA.properties.qualification.properties).sort())
  assert.deepEqual([...SYSTEM_PROMOTION_KEYS].sort(), Object.keys(SCHEMA.properties.qualification.properties.promotion.properties).sort())
  assert.deepEqual([...SYSTEM_ROOT_KEYS].sort(), [...SCHEMA.required].sort())
  assert.deepEqual([...SYSTEM_REPOSITORY_KEYS].sort(), [...SCHEMA.properties.repositories.items.required].sort())
  assert.deepEqual([...SYSTEM_CONTRACT_KEYS].sort(), [...SCHEMA.properties.contracts.items.required].sort())
  assert.deepEqual([...SYSTEM_EVIDENCE_KEYS].sort(), [...SCHEMA.properties.contracts.items.properties.evidence.required].sort())
  assert.deepEqual([...SYSTEM_VERIFICATION_KEYS].sort(), [...SCHEMA.properties.verifications.items.required].sort())
  assert.deepEqual([...SYSTEM_QUALIFICATION_KEYS].sort(), [...SCHEMA.properties.qualification.required].sort())
  assert.deepEqual([...SYSTEM_PROMOTION_KEYS].sort(), [...SCHEMA.properties.qualification.properties.promotion.required].sort())
})

test('system run executes only the selected tier and writes a passing receipt', async () => {
  const value = fixture()
  const unitMarker = join(value.root, 'unit-ran')
  const contractMarker = join(value.root, 'contract-ran')
  value.manifest.verifications[1].command = `touch ${unitMarker}`
  value.manifest.verifications.push({
    id: 'runtime-contract', repository: 'runtime', tier: 'contract', command: `touch ${contractMarker}`, external: false, reviewed_by: '@owner',
  })
  writeFileSync(value.manifestPath, JSON.stringify(value.manifest, null, 2) + '\n')
  const receiptPath = join(value.root, 'unit-receipt.json')
  await assert.rejects(runSystemTier(value.manifestPath, 'unit', join(value.runtime, 'receipt.json')), /outside every declared repository/)
  const receipt = await runSystemTier(value.manifestPath, 'unit', receiptPath, { timeoutMs: 5000 })
  assert.equal(receipt.status, 'passed')
  assert.equal(receipt.results.length, 1)
  assert.equal(receipt.results[0].id, 'runtime-unit')
  assert.equal(existsSync(unitMarker), true)
  assert.equal(existsSync(contractMarker), false)
  assert.deepEqual(validateSystemReceipt(receipt), [])
  assert.equal(checkSystemReceipt(value.manifestPath, receiptPath).valid, true)
  await assert.rejects(runSystemTier(value.manifestPath, 'unit', receiptPath), /receipt already exists/)
  rmSync(value.root, { recursive: true, force: true })
})

test('system run refuses a non-ready snapshot before creating a receipt', async () => {
  const value = fixture()
  writeFileSync(join(value.runtime, 'dirty.txt'), 'dirty\n')
  const receiptPath = join(value.root, 'must-not-exist.json')
  await assert.rejects(runSystemTier(value.manifestPath, 'unit', receiptPath), /snapshot is not ready/)
  assert.equal(existsSync(receiptPath), false)
  rmSync(value.root, { recursive: true, force: true })
})

test('a failed tier still writes a failed receipt', async () => {
  const value = fixture()
  value.manifest.verifications[1].command = 'node -e "process.exit(7)"'
  writeFileSync(value.manifestPath, JSON.stringify(value.manifest, null, 2) + '\n')
  const receiptPath = join(value.root, 'failed-receipt.json')
  const receipt = await runSystemTier(value.manifestPath, 'unit', receiptPath, { timeoutMs: 5000 })
  assert.equal(receipt.status, 'failed')
  assert.equal(receipt.results[0].exit_code, 7)
  assert.equal(JSON.parse(readFileSync(receiptPath, 'utf8')).status, 'failed')
  assert.match(checkSystemReceipt(value.manifestPath, receiptPath).problems.join('\n'), /does not contain a passing run/)
  rmSync(value.root, { recursive: true, force: true })
})

test('a timed-out tier records timeout evidence', async () => {
  const value = fixture()
  value.manifest.verifications[1].command = 'node -e "setInterval(() => {}, 1000)"'
  writeFileSync(value.manifestPath, JSON.stringify(value.manifest, null, 2) + '\n')
  const receipt = await runSystemTier(value.manifestPath, 'unit', join(value.root, 'timeout-receipt.json'), { timeoutMs: 50 })
  assert.equal(receipt.status, 'failed')
  assert.equal(receipt.results[0].timed_out, true)
  assert.equal(receipt.results[0].ok, false)
  rmSync(value.root, { recursive: true, force: true })
})

test('external-qualified requires explicit execution authority', async () => {
  const value = fixture()
  const marker = join(value.root, 'external-ran')
  value.manifest.verifications.push({
    id: 'external-probe', repository: 'control', tier: 'external-qualified', command: `touch ${marker}`, external: true, reviewed_by: '@owner',
  })
  writeFileSync(value.manifestPath, JSON.stringify(value.manifest, null, 2) + '\n')
  const receiptPath = join(value.root, 'external-receipt.json')
  await assert.rejects(runSystemTier(value.manifestPath, 'external-qualified', receiptPath), /requires --allow-external/)
  assert.equal(existsSync(marker), false)
  await runSystemTier(value.manifestPath, 'external-qualified', receiptPath, { allowExternal: true, timeoutMs: 5000 })
  assert.equal(existsSync(marker), true)
  rmSync(value.root, { recursive: true, force: true })
})

test('receipt check rejects manifest and repository drift without rerunning commands', async () => {
  const value = fixture()
  const receiptPath = join(value.root, 'receipt.json')
  await runSystemTier(value.manifestPath, 'unit', receiptPath, { timeoutMs: 5000 })
  writeFileSync(value.manifestPath, readFileSync(value.manifestPath, 'utf8') + '\n')
  writeFileSync(join(value.runtime, 'later.txt'), 'later\n')
  const report = checkSystemReceipt(value.manifestPath, receiptPath)
  assert.equal(report.valid, false)
  assert.match(report.problems.join('\n'), /manifest hash does not match receipt/)
  assert.match(report.problems.join('\n'), /system snapshot is no longer ready/)
  rmSync(value.root, { recursive: true, force: true })
})

test('receipt check reports malformed result collections without crashing', async () => {
  const value = fixture()
  const receiptPath = join(value.root, 'receipt.json')
  const receipt = await runSystemTier(value.manifestPath, 'unit', receiptPath, { timeoutMs: 5000 })
  receipt.results = {}
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n')
  const report = checkSystemReceipt(value.manifestPath, receiptPath)
  assert.equal(report.valid, false)
  assert.match(report.problems.join('\n'), /results: required non-empty array/)
  assert.match(report.problems.join('\n'), /receipt commands do not match selected tier/)
  rmSync(value.root, { recursive: true, force: true })
})

test('receipt schema and validator expose the same object fields', () => {
  assert.deepEqual([...SYSTEM_RECEIPT_KEYS].sort(), Object.keys(RECEIPT_SCHEMA.properties).sort())
  assert.deepEqual([...SYSTEM_RECEIPT_MANIFEST_KEYS].sort(), Object.keys(RECEIPT_SCHEMA.properties.manifest.properties).sort())
  assert.deepEqual([...SYSTEM_RECEIPT_REPOSITORY_KEYS].sort(), Object.keys(RECEIPT_SCHEMA.properties.repositories.items.properties).sort())
  assert.deepEqual([...SYSTEM_RECEIPT_RESULT_KEYS].sort(), Object.keys(RECEIPT_SCHEMA.properties.results.items.properties).sort())
  assert.deepEqual([...SYSTEM_RECEIPT_STREAM_KEYS].sort(), Object.keys(RECEIPT_SCHEMA.definitions.stream.properties).sort())
  assert.deepEqual([...SYSTEM_RECEIPT_KEYS].sort(), [...RECEIPT_SCHEMA.required].sort())
  assert.deepEqual([...SYSTEM_RECEIPT_MANIFEST_KEYS].sort(), [...RECEIPT_SCHEMA.properties.manifest.required].sort())
  assert.deepEqual([...SYSTEM_RECEIPT_REPOSITORY_KEYS].sort(), [...RECEIPT_SCHEMA.properties.repositories.items.required].sort())
  assert.deepEqual([...SYSTEM_RECEIPT_RESULT_KEYS].sort(), [...RECEIPT_SCHEMA.properties.results.items.required].sort())
  assert.deepEqual([...SYSTEM_RECEIPT_STREAM_KEYS].sort(), [...RECEIPT_SCHEMA.definitions.stream.required].sort())
})

test('system run and receipt check work through the CLI', () => {
  const value = fixture()
  const receiptPath = join(value.root, 'cli-receipt.json')
  const run = spawnSync(process.execPath, [CLI, 'system-run', '--manifest', value.manifestPath, '--tier', 'unit', '--out', receiptPath, '--timeout', '5'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(JSON.parse(run.stdout).status, 'passed')
  const check = spawnSync(process.execPath, [CLI, 'system-receipt-check', '--manifest', value.manifestPath, '--receipt', receiptPath], { encoding: 'utf8' })
  assert.equal(check.status, 0, check.stderr)
  assert.equal(JSON.parse(check.stdout).valid, true)
  rmSync(value.root, { recursive: true, force: true })
})

test('system CI shadow reports missing evidence without blocking or executing commands', () => {
  const value = fixture()
  const receipts = join(value.root, 'receipts')
  const history = join(value.root, 'history')
  const shadow = spawnSync(process.execPath, [CLI, 'system-ci', '--manifest', value.manifestPath, '--receipts', receipts, '--history', history], { encoding: 'utf8' })
  const report = JSON.parse(shadow.stdout)
  assert.equal(shadow.status, 0)
  assert.equal(report.mode, 'shadow')
  assert.equal(report.healthy, false)
  assert.equal(report.would_block, true)
  assert.equal(report.blocking, false)
  assert.equal(report.commands_executed, false)
  assert.deepEqual(report.receipts.map((entry) => [entry.tier, entry.present]), [['unit', false]])
  assert.equal(existsSync(value.marker), false)
  assert.equal(report.history.available, false)
  assert.equal(existsSync(history), false)
  const enforced = spawnSync(process.execPath, [CLI, 'system-ci', '--manifest', value.manifestPath, '--receipts', receipts, '--enforce'], { encoding: 'utf8' })
  assert.equal(enforced.status, 1)
  assert.equal(JSON.parse(enforced.stdout).blocking, true)
  assert.equal(existsSync(value.marker), false)
  rmSync(value.root, { recursive: true, force: true })
})

test('system CI shadow contains a missing manifest while enforce blocks', () => {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-system-ci-missing-'))
  const manifest = join(root, 'missing.json')
  const shadow = spawnSync(process.execPath, [CLI, 'system-ci', '--manifest', manifest, '--receipts', root], { encoding: 'utf8' })
  assert.equal(shadow.status, 0)
  const shadowReport = JSON.parse(shadow.stdout)
  assert.equal(shadowReport.system_ready, false)
  assert.equal(shadowReport.blocking, false)
  assert.match(shadowReport.system_problems.join('\n'), /ENOENT/)
  const enforced = spawnSync(process.execPath, [CLI, 'system-ci', '--manifest', manifest, '--receipts', root, '--enforce'], { encoding: 'utf8' })
  assert.equal(enforced.status, 1)
  assert.equal(JSON.parse(enforced.stdout).blocking, true)
  rmSync(root, { recursive: true, force: true })
})

test('system CI shadow contains an invalid qualification policy', () => {
  const value = fixture()
  delete value.manifest.qualification.promotion
  writeFileSync(value.manifestPath, JSON.stringify(value.manifest, null, 2) + '\n')
  const shadow = spawnSync(process.execPath, [CLI, 'system-ci', '--manifest', value.manifestPath, '--receipts', value.root], { encoding: 'utf8' })
  assert.equal(shadow.status, 0)
  const report = JSON.parse(shadow.stdout)
  assert.equal(report.healthy, false)
  assert.match(report.system_problems.join('\n'), /qualification.promotion: required object/)
  assert.equal(report.history.promotion_eligible, false)
  assert.match(report.history.promotion_problems.join('\n'), /promotion policy invalid/)
  rmSync(value.root, { recursive: true, force: true })
})

test('system CI accepts a fresh receipt for every required tier', async () => {
  const value = fixture()
  const receipts = join(value.root, 'receipts')
  mkdirSync(receipts)
  await runSystemTier(value.manifestPath, 'unit', join(receipts, 'unit.receipt.json'), { timeoutMs: 5000 })
  const report = systemCiReport(value.manifestPath, receipts)
  assert.equal(report.system_ready, true)
  assert.equal(report.healthy, true)
  assert.equal(report.would_block, false)
  assert.deepEqual(report.receipts.map((entry) => [entry.tier, entry.valid]), [['unit', true]])
  rmSync(value.root, { recursive: true, force: true })
})

test('system CI rejects expired and future-dated receipts', async () => {
  const value = fixture()
  const receipts = join(value.root, 'receipts')
  mkdirSync(receipts)
  const receipt = await runSystemTier(value.manifestPath, 'unit', join(receipts, 'unit.receipt.json'), { timeoutMs: 5000 })
  const finished = Date.parse(receipt.finished_at)
  const boundary = systemCiReport(value.manifestPath, receipts, { now: finished + 3600 * 1000 })
  assert.equal(boundary.receipts[0].fresh, true)
  assert.equal(boundary.receipts[0].valid, true)
  const expired = systemCiReport(value.manifestPath, receipts, { now: finished + 3601 * 1000 })
  assert.equal(expired.receipts[0].fresh, false)
  assert.equal(expired.receipts[0].valid, false)
  assert.match(expired.receipts[0].problems.join('\n'), /exceeds max age of 3600 seconds/)
  const future = systemCiReport(value.manifestPath, receipts, { now: finished - 1000 })
  assert.equal(future.receipts[0].fresh, false)
  assert.match(future.receipts[0].problems.join('\n'), /finished_at is in the future/)
  rmSync(value.root, { recursive: true, force: true })
})

test('system CI computes bounded advisory history and isolates invalid observations', async () => {
  const value = fixture()
  value.manifest.qualification.promotion = {
    history_window: 3,
    minimum_runs: 3,
    minimum_healthy_rate: 0.66,
    minimum_consecutive_healthy_runs: 2,
  }
  writeFileSync(value.manifestPath, JSON.stringify(value.manifest, null, 2) + '\n')
  const receipts = join(value.root, 'receipts')
  const history = join(value.root, 'history')
  mkdirSync(receipts)
  mkdirSync(history)
  const receipt = await runSystemTier(value.manifestPath, 'unit', join(receipts, 'unit.receipt.json'), { timeoutMs: 5000 })
  const now = Date.parse(receipt.finished_at) + 1000
  const observation = (seconds, healthy, systemId = value.manifest.id) => ({
    schema_version: 'coding-harness.system-ci/v1',
    system_id: systemId,
    observed_at: new Date(now - seconds * 1000).toISOString(),
    healthy,
  })
  writeFileSync(join(history, '01.json'), JSON.stringify(observation(4, true)))
  writeFileSync(join(history, '02.json'), JSON.stringify(observation(3, false)))
  writeFileSync(join(history, '03.json'), JSON.stringify(observation(2, true)))
  writeFileSync(join(history, 'foreign.json'), JSON.stringify(observation(1, true, 'another-system')))
  writeFileSync(join(history, 'malformed.json'), '{')
  const report = systemCiReport(value.manifestPath, receipts, { historyDir: history, now })
  assert.equal(report.healthy, true)
  assert.equal(report.history.prior_observations, 3)
  assert.equal(report.history.ignored_files, 2)
  assert.equal(report.history.sample_size, 3)
  assert.equal(report.history.healthy_runs, 2)
  assert.equal(report.history.healthy_rate, 2 / 3)
  assert.equal(report.history.consecutive_healthy_runs, 2)
  assert.equal(report.history.promotion_eligible, true)
  const cli = spawnSync(process.execPath, [CLI, 'system-ci', '--manifest', value.manifestPath, '--receipts', receipts, '--history', history], { encoding: 'utf8' })
  assert.equal(cli.status, 0)
  const cliReport = JSON.parse(cli.stdout)
  assert.equal(cliReport.history.path, history)
  assert.equal(cliReport.history.prior_observations, 3)
  assert.equal(cliReport.history.ignored_files, 2)
  rmSync(value.root, { recursive: true, force: true })
})

test('advisory history never changes enforcement of a currently healthy system', async () => {
  const value = fixture()
  value.manifest.qualification.promotion.minimum_runs = 5
  writeFileSync(value.manifestPath, JSON.stringify(value.manifest, null, 2) + '\n')
  const receipts = join(value.root, 'receipts')
  mkdirSync(receipts)
  const receipt = await runSystemTier(value.manifestPath, 'unit', join(receipts, 'unit.receipt.json'), { timeoutMs: 5000 })
  const report = systemCiReport(value.manifestPath, receipts, { enforce: true, now: Date.parse(receipt.finished_at) })
  assert.equal(report.healthy, true)
  assert.equal(report.history.promotion_eligible, false)
  assert.equal(report.blocking, false)
  rmSync(value.root, { recursive: true, force: true })
})

test('receipt verification survives relocating the whole system bundle', async () => {
  const value = fixture()
  const receipts = join(value.root, 'receipts')
  mkdirSync(receipts)
  await runSystemTier(value.manifestPath, 'unit', join(receipts, 'unit.receipt.json'), { timeoutMs: 5000 })
  const movedParent = mkdtempSync(join(tmpdir(), 'coding-harness-system-moved-'))
  const moved = join(movedParent, 'bundle')
  cpSync(value.root, moved, { recursive: true })
  const report = systemCiReport(join(moved, 'system.manifest.json'), join(moved, 'receipts'))
  assert.equal(report.healthy, true)
  rmSync(value.root, { recursive: true, force: true })
  rmSync(movedParent, { recursive: true, force: true })
})
