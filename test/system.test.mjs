import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  SYSTEM_CONTRACT_KEYS,
  SYSTEM_EVIDENCE_KEYS,
  SYSTEM_REPOSITORY_KEYS,
  SYSTEM_ROOT_KEYS,
  SYSTEM_VERIFICATION_KEYS,
  checkSystemManifest,
  validateSystemManifest,
} from '../src/system.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')
const SCHEMA = JSON.parse(readFileSync(resolve(import.meta.dirname, '../schema/system.manifest.schema.json'), 'utf8'))

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
  assert.deepEqual([...SYSTEM_ROOT_KEYS].sort(), [...SCHEMA.required].sort())
  assert.deepEqual([...SYSTEM_REPOSITORY_KEYS].sort(), [...SCHEMA.properties.repositories.items.required].sort())
  assert.deepEqual([...SYSTEM_CONTRACT_KEYS].sort(), [...SCHEMA.properties.contracts.items.required].sort())
  assert.deepEqual([...SYSTEM_EVIDENCE_KEYS].sort(), [...SCHEMA.properties.contracts.items.properties.evidence.required].sort())
  assert.deepEqual([...SYSTEM_VERIFICATION_KEYS].sort(), [...SCHEMA.properties.verifications.items.required].sort())
})
