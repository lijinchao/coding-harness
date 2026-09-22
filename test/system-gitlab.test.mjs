import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { checkSystemManifest } from '../src/system.mjs'
import { GITLAB_JOB_KEYS, GITLAB_MR_KEYS, GITLAB_OBSERVATION_KEYS, GITLAB_PIPELINE_KEYS, GITLAB_RESULT_KEYS, GITLAB_RULE_KEYS, GITLAB_TARGET_KEYS, observeSystemGitlab, validateGitlabHost, validateGitlabObservation, validateGitlabTargets } from '../src/system-gitlab.mjs'

const HOST = 'ai.code.geelib.qihoo.net'
const TOKEN = 'secret-never-write-this'
const TARGET_SCHEMA = JSON.parse(readFileSync(resolve(import.meta.dirname, '../schema/system-gitlab-targets.schema.json'), 'utf8'))
const REPORT_SCHEMA = JSON.parse(readFileSync(resolve(import.meta.dirname, '../schema/system-gitlab-observation.schema.json'), 'utf8'))
const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function commit(root, message) {
  execFileSync('git', ['-C', root, 'add', '-A'])
  execFileSync('git', ['-C', root, '-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', message])
  return execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-gitlab-'))
  const repo = join(root, 'runtime')
  mkdirSync(repo)
  execFileSync('git', ['-C', repo, 'init', '-q'])
  writeFileSync(join(repo, 'main.js'), 'export const value = 1\n')
  const base = commit(repo, 'baseline')
  writeFileSync(join(repo, 'main.js'), 'export const value = 2\n')
  writeFileSync(join(repo, 'change.md'), 'Change-ID: CHG-42\n')
  const head = commit(repo, 'change')
  execFileSync('git', ['-C', repo, 'remote', 'add', 'origin', `https://${HOST}/team/runtime.git`])
  const manifestPath = join(root, 'system.json')
  const manifest = {
    schema_version: 'coding-harness.system/v1', id: 'demo-system',
    repositories: [{ id: 'runtime', role: 'runtime', path: 'runtime', revision: head }],
    change: { id: 'CHG-42', records: [{ repository: 'runtime', path: 'change.md' }], bases: [{ repository: 'runtime', revision: base }] },
    contracts: [],
    verifications: [{ id: 'unit', repository: 'runtime', tier: 'unit', command: 'node --version', external: false, reviewed_by: '@owner' }],
    qualification: { required_tiers: ['unit'], max_receipt_age_seconds: 3600, promotion: { history_window: 2, minimum_runs: 1, minimum_healthy_rate: 1, minimum_consecutive_healthy_runs: 1 } },
  }
  writeFileSync(manifestPath, JSON.stringify(manifest) + '\n')
  const targetsPath = join(root, 'targets.json')
  const targets = { schema_version: 'coding-harness.gitlab-targets/v1', merge_requests: [{ repository: 'runtime', project_id: 123, project_path: 'team/runtime', iid: 7, target_branch: 'main', required_jobs: ['unit'] }] }
  writeFileSync(targetsPath, JSON.stringify(targets) + '\n')
  return { root, repo, head, manifestPath, targetsPath, targets, output: join(root, 'observation.json') }
}

function api(value, overrides = {}) {
  const project = { id: 123, path_with_namespace: 'team/runtime' }
  const mr = { project_id: 123, source_project_id: 123, iid: 7, state: 'opened', target_branch: 'main', sha: value.head, author: { id: 91 }, head_pipeline: { id: 456 } }
  const approval = { approval_rules_overwritten: false, rules: [{ id: 8, name: 'Owner', approvals_required: 1, approved: true, approved_by: [{ id: 92 }] }] }
  const pipeline = { id: 456, project_id: 123, sha: value.head, source: 'merge_request_event', status: 'success' }
  const jobs = [{ id: 789, name: 'unit', status: 'success', allow_failure: false, pipeline: { id: 456 } }]
  const calls = []
  let mrReads = 0
  let approvalReads = 0
  const fetchImpl = async (url, options) => {
    calls.push(url)
    assert.equal(options.method, 'GET')
    assert.equal(options.redirect, 'error')
    assert.equal(options.headers['PRIVATE-TOKEN'], TOKEN)
    assert.ok(url.startsWith('https://' + HOST + '/api/v4/'))
    const path = url.split('/api/v4/')[1]
    let response
    if (path === 'projects/123') response = overrides.project ?? project
    else if (path === 'projects/123/merge_requests/7') response = (++mrReads === 1 ? overrides.mr : overrides.mrAfter) ?? mr
    else if (path === 'projects/123/merge_requests/7/approval_state') response = (++approvalReads === 1 ? overrides.approval : overrides.approvalAfter) ?? approval
    else if (path === 'projects/123/pipelines/456') response = overrides.pipeline ?? pipeline
    else if (path.startsWith('projects/123/pipelines/456/jobs?')) response = path.endsWith('page=2') ? (overrides.jobsPage2 ?? []) : (overrides.jobs ?? jobs)
    else assert.fail('unexpected GitLab GET: ' + path)
    if (overrides.status) return new Response('private-error-body', { status: overrides.status })
    if (overrides.malformed) return new Response('not-json', { status: 200 })
    return new Response(JSON.stringify(response), { status: 200, headers: path.endsWith('page=1') && overrides.jobsPage2 ? { 'x-next-page': '2' } : {} })
  }
  return { fetchImpl, calls }
}

async function observe(value, overrides = {}) {
  const transport = api(value, overrides)
  const report = await observeSystemGitlab(value.manifestPath, value.targetsPath, value.output, { host: HOST, token: TOKEN, fetchImpl: transport.fetchImpl })
  return { report, calls: transport.calls }
}

test('GitLab observation binds real project, MR HEAD, rules, Pipeline and Job without storing secrets', async () => {
  const value = fixture()
  try {
    assert.equal(checkSystemManifest(value.manifestPath).ready, true)
    const { report, calls } = await observe(value)
    assert.equal(report.valid, true)
    assert.equal(report.change_id, 'CHG-42')
    assert.equal(report.results[0].expected_revision, value.head)
    assert.equal(report.results[0].mr_sha, value.head)
    assert.equal(report.results[0].pipeline.id, 456)
    assert.deepEqual(report.results[0].approval_rules[0].approver_ids, [92])
    assert.deepEqual(report.results[0].jobs[0], { id: 789, name: 'unit', status: 'success', pipeline_id: 456 })
    assert.equal(report.remote_reads, true)
    assert.equal(report.commands_executed, false)
    assert.deepEqual(validateGitlabObservation(report), [])
    assert.equal(calls.length, 7)
    const raw = readFileSync(value.output, 'utf8')
    assert.ok(!raw.includes(TOKEN))
    assert.ok(!raw.includes('private-error-body'))
    assert.equal(execFileSync('git', ['-C', value.repo, 'status', '--porcelain'], { encoding: 'utf8' }).trim(), '')
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})

test('GitLab observation rejects stale source SHA, wrong project, and changed MR on re-read', async () => {
  for (const overrides of [
    { mr: { project_id: 123, source_project_id: 123, iid: 7, state: 'opened', target_branch: 'main', sha: '0'.repeat(40), author: { id: 91 }, head_pipeline: { id: 456 } } },
    { project: { id: 123, path_with_namespace: 'team/other' } },
    { mrAfter: { sha: '0'.repeat(40), head_pipeline: { id: 456 }, target_branch: 'main', state: 'opened' } },
  ]) {
    const value = fixture()
    try {
      const { report } = await observe(value, overrides)
      assert.equal(report.valid, false)
      assert.match(report.results[0].problems.join(' '), /mismatch|differs|changed/)
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  }
})

test('GitLab observation does not accept a true flag without positive satisfied approval rules', async () => {
  const value = fixture()
  try {
    const transport = api(value, { approval: { approval_rules_overwritten: false, approved: true, rules: [] } })
    const report = await observeSystemGitlab(value.manifestPath, value.targetsPath, value.output, { host: HOST, token: TOKEN, fetchImpl: transport.fetchImpl })
    assert.equal(report.valid, false)
    assert.match(report.results[0].problems.join(' '), /no positive approval rule/)
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})

test('GitLab observation rejects self-approval, unsatisfied rules and overwritten rules', async () => {
  for (const approval of [
    { approval_rules_overwritten: false, rules: [{ id: 8, name: 'Owner', approvals_required: 1, approved: true, approved_by: [{ id: 91 }] }] },
    { approval_rules_overwritten: false, rules: [{ id: 8, name: 'Owner', approvals_required: 2, approved: true, approved_by: [{ id: 92 }] }] },
    { approval_rules_overwritten: true, rules: [{ id: 8, name: 'Owner', approvals_required: 1, approved: true, approved_by: [{ id: 92 }] }] },
  ]) {
    const value = fixture()
    try {
      const { report } = await observe(value, { approval })
      assert.equal(report.valid, false)
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  }
})

test('GitLab observation detects approval drift during the read window', async () => {
  const value = fixture()
  try {
    const { report } = await observe(value, { approvalAfter: { approval_rules_overwritten: false, rules: [{ id: 8, name: 'Owner', approvals_required: 1, approved: true, approved_by: [{ id: 93 }] }] } })
    assert.equal(report.valid, false)
    assert.match(report.results[0].problems.join(' '), /approvals changed/)
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})

test('GitLab observation reads later Job pages before deciding required Job status', async () => {
  const value = fixture()
  try {
    const { report, calls } = await observe(value, { jobs: [{ id: 790, name: 'lint', status: 'success', allow_failure: false, pipeline: { id: 456 } }], jobsPage2: [{ id: 789, name: 'unit', status: 'success', allow_failure: false, pipeline: { id: 456 } }] })
    assert.equal(report.valid, true)
    assert.ok(calls.some((url) => url.endsWith('page=2')))
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})

test('GitLab observation rejects wrong Pipeline and missing or allow-failure Job', async () => {
  const value = fixture()
  try {
    const { report } = await observe(value, { pipeline: { id: 456, project_id: 123, sha: '0'.repeat(40), source: 'merge_request_event', status: 'success' } })
    assert.equal(report.valid, false)
    assert.match(report.results[0].problems.join(' '), /Pipeline/)
  } finally { rmSync(value.root, { recursive: true, force: true }) }
  for (const jobs of [[], [{ id: 789, name: 'unit', status: 'success', allow_failure: true, pipeline: { id: 456 } }]]) {
    const next = fixture()
    try {
      const { report } = await observe(next, { jobs })
      assert.equal(report.valid, false)
      assert.match(report.results[0].problems.join(' '), /Job/)
    } finally { rmSync(next.root, { recursive: true, force: true }) }
  }
})

test('GitLab observation rejects non-success and malformed responses without leaking bodies', async () => {
  for (const overrides of [{ status: 403 }, { malformed: true }]) {
    const value = fixture()
    try {
      const { report } = await observe(value, overrides)
      assert.equal(report.valid, false)
      assert.ok(!JSON.stringify(report).includes('private-error-body'))
    } finally { rmSync(value.root, { recursive: true, force: true }) }
  }
})

test('GitLab targets and output location fail before egress', async () => {
  const value = fixture()
  try {
    const check = checkSystemManifest(value.manifestPath)
    assert.equal(validateGitlabHost('127.0.0.1'), false)
    assert.equal(validateGitlabHost('https://evil.test/path'), false)
    assert.match(validateGitlabTargets({ ...value.targets, merge_requests: [] }, check).join(' '), /non-empty/)
    const bad = { ...value.targets, merge_requests: [{ ...value.targets.merge_requests[0], repository: 'other' }] }
    assert.match(validateGitlabTargets(bad, check).join(' '), /changed system member/)
    const duplicate = { ...value.targets, merge_requests: [value.targets.merge_requests[0], value.targets.merge_requests[0]] }
    assert.match(validateGitlabTargets(duplicate, check).join(' '), /duplicate member/)
    const transport = api(value)
    await assert.rejects(observeSystemGitlab(value.manifestPath, value.targetsPath, join(value.repo, 'report.json'), { host: HOST, token: TOKEN, fetchImpl: transport.fetchImpl }), /outside every declared repository/)
    assert.deepEqual(transport.calls, [])
    assert.equal(existsSync(join(value.repo, 'report.json')), false)
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})

test('GitLab CLI requires an env-only token and does not initiate egress without it', () => {
  const value = fixture()
  try {
    const result = spawnSync(process.execPath, [CLI, 'system-gitlab-observe', '--manifest', value.manifestPath, '--targets', value.targetsPath, '--host', HOST, '--token-env', 'HARNESS_TEST_MISSING_TOKEN', '--out', value.output], { encoding: 'utf8', env: { ...process.env, HARNESS_TEST_MISSING_TOKEN: '' } })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /GitLab token is unavailable/)
    assert.equal(existsSync(value.output), false)
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})

test('GitLab observation refuses ambiguous remotes before project reads', async () => {
  const value = fixture()
  try {
    execFileSync('git', ['-C', value.repo, 'remote', 'add', 'other', `git@${HOST}:team/other.git`])
    const { report, calls } = await observe(value)
    assert.equal(report.valid, false)
    assert.deepEqual(calls, [])
    assert.match(report.results[0].problems.join(' '), /remote does not match/)
  } finally { rmSync(value.root, { recursive: true, force: true }) }
})

test('GitLab targets schema and validator expose the same exact object fields', () => {
  assert.deepEqual([...GITLAB_TARGET_KEYS].sort(), Object.keys(TARGET_SCHEMA.properties).sort())
  assert.deepEqual([...GITLAB_TARGET_KEYS].sort(), [...TARGET_SCHEMA.required].sort())
  assert.deepEqual([...GITLAB_MR_KEYS].sort(), Object.keys(TARGET_SCHEMA.properties.merge_requests.items.properties).sort())
  assert.deepEqual([...GITLAB_MR_KEYS].sort(), [...TARGET_SCHEMA.properties.merge_requests.items.required].sort())
})

test('GitLab observation schema and validator expose exact nested fields', () => {
  const result = REPORT_SCHEMA.properties.results.items
  assert.deepEqual([...GITLAB_OBSERVATION_KEYS].sort(), Object.keys(REPORT_SCHEMA.properties).sort())
  assert.deepEqual([...GITLAB_OBSERVATION_KEYS].sort(), [...REPORT_SCHEMA.required].sort())
  assert.deepEqual([...GITLAB_RESULT_KEYS].sort(), Object.keys(result.properties).sort())
  assert.deepEqual([...GITLAB_RESULT_KEYS].sort(), [...result.required].sort())
  for (const [keys, schema] of [
    [GITLAB_RULE_KEYS, result.properties.approval_rules.items],
    [GITLAB_PIPELINE_KEYS, result.properties.pipeline],
    [GITLAB_JOB_KEYS, result.properties.jobs.items],
  ]) {
    assert.deepEqual([...keys].sort(), Object.keys(schema.properties).sort())
    assert.deepEqual([...keys].sort(), [...schema.required].sort())
  }
  assert.match(validateGitlabObservation({ schema_version: 'coding-harness.gitlab-observation/v1' }).join(' '), /missing field/)
  const malformed = {
    schema_version: 'coding-harness.gitlab-observation/v1', system_id: 's', change_id: 'c',
    manifest_sha256: '0'.repeat(64), targets_sha256: '0'.repeat(64), observed_at: new Date().toISOString(),
    host: HOST, results: [{ repository: 'runtime', project_id: 123, project_path: 'team/runtime', mr_iid: 7,
      expected_revision: '0'.repeat(40), mr_sha: '0'.repeat(40), approval_rules: null,
      pipeline: null, jobs: null, ok: true, problems: null }], valid: true,
    remote_reads: true, commands_executed: false, note: 'test',
  }
  assert.match(validateGitlabObservation(malformed).join(' '), /invalid outcome|passing result lacks evidence/)
})
