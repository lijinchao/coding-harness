import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { isIP } from 'node:net'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { sha256 } from './compose.mjs'
import { checkSystemManifest } from './system.mjs'

export const GITLAB_TARGET_KEYS = ['schema_version', 'merge_requests']
export const GITLAB_MR_KEYS = ['repository', 'project_id', 'project_path', 'iid', 'target_branch', 'required_jobs', 'policy']
export const GITLAB_POLICY_KEYS = ['approval', 'pipeline']
export const GITLAB_RESULT_POLICY_KEYS = ['approval', 'pipeline', 'required_jobs']
export const GITLAB_OBSERVATION_KEYS = ['schema_version', 'system_id', 'change_id', 'manifest_sha256', 'targets_sha256', 'observed_at', 'host', 'results', 'valid', 'remote_reads', 'commands_executed', 'note']
export const GITLAB_RESULT_KEYS = ['repository', 'project_id', 'project_path', 'mr_iid', 'expected_revision', 'mr_sha', 'mr_author_id', 'approval_rules_overwritten', 'approval_rules', 'pipeline', 'jobs', 'policy', 'observed', 'ok', 'problems']
export const GITLAB_RULE_KEYS = ['id', 'name', 'required', 'approved', 'approver_ids']
export const GITLAB_PIPELINE_KEYS = ['id', 'sha', 'source', 'status']
export const GITLAB_JOB_KEYS = ['id', 'name', 'status', 'pipeline_id', 'allow_failure', 'retried']
const COMMIT = /^[0-9a-f]{40}$/
const HOST = /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/
const PROJECT_SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/
const DEFAULT_POLICY = Object.freeze({ approval: 'all-positive', pipeline: 'detached-mr' })

function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value) }
function positive(value) { return Number.isSafeInteger(value) && value > 0 }
function inside(path, root) {
  const rel = relative(root, path)
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

export function validateGitlabHost(host) {
  return typeof host === 'string' && host.length <= 253 && host.includes('.')
    && HOST.test(host) && !host.includes('..') && isIP(host) === 0
    && host.split('.').every((part) => part.length <= 63 && !part.startsWith('-') && !part.endsWith('-'))
}

export function validateGitlabTargets(value, check) {
  const issues = []
  if (!object(value)) return ['targets: required object']
  for (const key of Object.keys(value)) if (!GITLAB_TARGET_KEYS.includes(key)) issues.push('targets.' + key + ': unknown field')
  if (value.schema_version !== 'coding-harness.gitlab-targets/v1') issues.push('schema_version: invalid GitLab targets version')
  if (!Array.isArray(value.merge_requests) || value.merge_requests.length === 0) return [...issues, 'merge_requests: required non-empty array']
  if (check.change?.bases === null || check.change === null) issues.push('system change baselines are required for GitLab observation')
  const changed = new Set((check.change?.bases ?? []).filter((entry) => entry.changed_paths?.length > 0).map((entry) => entry.repository))
  const seen = new Set()
  value.merge_requests.forEach((entry, index) => {
    const where = 'merge_requests[' + index + ']'
    if (!object(entry)) { issues.push(where + ': required object'); return }
    for (const key of Object.keys(entry)) if (!GITLAB_MR_KEYS.includes(key)) issues.push(where + '.' + key + ': unknown field')
    if (typeof entry.repository !== 'string' || !changed.has(entry.repository)) issues.push(where + '.repository: must be a changed system member')
    if (seen.has(entry.repository)) issues.push(where + '.repository: duplicate member')
    seen.add(entry.repository)
    if (!positive(entry.project_id)) issues.push(where + '.project_id: required positive integer')
    if (typeof entry.project_path !== 'string' || entry.project_path.split('/').length < 2 || !entry.project_path.split('/').every((part) => PROJECT_SEGMENT.test(part))) issues.push(where + '.project_path: required namespace/repository path')
    if (!positive(entry.iid)) issues.push(where + '.iid: required positive integer')
    if (typeof entry.target_branch !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(entry.target_branch) || entry.target_branch.includes('..')) issues.push(where + '.target_branch: required safe branch name')
    if (!Array.isArray(entry.required_jobs) || entry.required_jobs.length === 0 || entry.required_jobs.some((name) => typeof name !== 'string' || name.length === 0 || name.includes('\n')) || new Set(entry.required_jobs).size !== entry.required_jobs.length) issues.push(where + '.required_jobs: required unique non-empty job names')
    if (entry.policy !== undefined) {
      if (!object(entry.policy)) issues.push(where + '.policy: required object')
      else {
        for (const key of Object.keys(entry.policy)) if (!GITLAB_POLICY_KEYS.includes(key)) issues.push(where + '.policy.' + key + ': unknown field')
        if (!['all-positive', 'observe-only'].includes(entry.policy.approval)) issues.push(where + '.policy.approval: unsupported policy')
        if (!['detached-mr', 'mr-head-success'].includes(entry.policy.pipeline)) issues.push(where + '.policy.pipeline: unsupported policy')
      }
    }
  })
  for (const id of changed) if (!seen.has(id)) issues.push('merge_requests: missing changed repository ' + id)
  return issues
}

function exactFields(issues, value, keys, where) {
  if (!object(value)) { issues.push(where + ': required object'); return false }
  for (const key of keys) if (!Object.hasOwn(value, key)) issues.push(where + '.' + key + ': missing field')
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push(where + '.' + key + ': unknown field')
  return true
}

export function validateGitlabObservation(report) {
  const issues = []
  if (!exactFields(issues, report, GITLAB_OBSERVATION_KEYS, 'root')) return issues
  if (report.schema_version !== 'coding-harness.gitlab-observation/v1') issues.push('schema_version: invalid observation version')
  for (const key of ['system_id', 'change_id', 'note']) if (typeof report[key] !== 'string' || !report[key]) issues.push(key + ': required string')
  for (const key of ['manifest_sha256', 'targets_sha256']) if (typeof report[key] !== 'string' || !/^[0-9a-f]{64}$/.test(report[key])) issues.push(key + ': required SHA-256')
  if (!Number.isFinite(Date.parse(report.observed_at))) issues.push('observed_at: invalid timestamp')
  if (!validateGitlabHost(report.host)) issues.push('host: invalid GitLab host')
  if (report.remote_reads !== true || report.commands_executed !== false) issues.push('execution boundary: invalid flags')
  if (!Array.isArray(report.results) || report.results.length === 0) return [...issues, 'results: required non-empty array']
  report.results.forEach((entry, index) => {
    const where = 'results[' + index + ']'
    if (!exactFields(issues, entry, GITLAB_RESULT_KEYS, where)) return
    if (typeof entry.repository !== 'string' || !entry.repository || !positive(entry.project_id) || typeof entry.project_path !== 'string' || !positive(entry.mr_iid) || !COMMIT.test(entry.expected_revision ?? '')) issues.push(where + ': invalid identity')
    if (entry.mr_sha !== null && !COMMIT.test(entry.mr_sha ?? '')) issues.push(where + '.mr_sha: invalid SHA')
    if (entry.mr_author_id !== null && !positive(entry.mr_author_id)) issues.push(where + '.mr_author_id: invalid identity')
    if (entry.approval_rules_overwritten !== null && typeof entry.approval_rules_overwritten !== 'boolean') issues.push(where + '.approval_rules_overwritten: invalid flag')
    if (!Array.isArray(entry.approval_rules)) issues.push(where + '.approval_rules: required array')
    else entry.approval_rules.forEach((rule, i) => {
      if (!exactFields(issues, rule, GITLAB_RULE_KEYS, where + '.approval_rules[' + i + ']')) return
      if (!positive(rule.id) || typeof rule.name !== 'string' || !rule.name || !positive(rule.required) || typeof rule.approved !== 'boolean' || !Array.isArray(rule.approver_ids) || rule.approver_ids.some((id) => !positive(id))) issues.push(where + '.approval_rules[' + i + ']: invalid rule')
    })
    if (entry.pipeline !== null && exactFields(issues, entry.pipeline, GITLAB_PIPELINE_KEYS, where + '.pipeline')) {
      if (entry.pipeline.id !== null && !positive(entry.pipeline.id)) issues.push(where + '.pipeline.id: invalid id')
      if (entry.pipeline.sha !== null && !COMMIT.test(entry.pipeline.sha ?? '')) issues.push(where + '.pipeline.sha: invalid SHA')
    }
    if (!Array.isArray(entry.jobs)) issues.push(where + '.jobs: required array')
    else entry.jobs.forEach((job, i) => {
      if (!exactFields(issues, job, GITLAB_JOB_KEYS, where + '.jobs[' + i + ']')) return
      if (job.id !== null && !positive(job.id)) issues.push(where + '.jobs[' + i + '].id: invalid id')
      if (job.allow_failure !== null && typeof job.allow_failure !== 'boolean') issues.push(where + '.jobs[' + i + '].allow_failure: invalid flag')
      if (job.retried !== null && typeof job.retried !== 'boolean') issues.push(where + '.jobs[' + i + '].retried: invalid flag')
    })
    if (exactFields(issues, entry.policy, GITLAB_RESULT_POLICY_KEYS, where + '.policy')) {
      if (!['all-positive', 'observe-only'].includes(entry.policy.approval) || !['detached-mr', 'mr-head-success'].includes(entry.policy.pipeline)) issues.push(where + '.policy: unsupported policy')
      if (!Array.isArray(entry.policy.required_jobs) || entry.policy.required_jobs.length === 0 || entry.policy.required_jobs.some((name) => typeof name !== 'string' || !name) || new Set(entry.policy.required_jobs).size !== entry.policy.required_jobs.length) issues.push(where + '.policy.required_jobs: invalid job list')
    }
    if (typeof entry.observed !== 'boolean') issues.push(where + '.observed: required boolean')
    if (typeof entry.ok !== 'boolean' || !Array.isArray(entry.problems) || entry.problems.some((problem) => typeof problem !== 'string' || !problem)) issues.push(where + ': invalid outcome')
    if (entry.ok === true && (
      entry.observed !== true || !Array.isArray(entry.problems) || entry.problems.length !== 0 || entry.mr_sha !== entry.expected_revision
      || entry.pipeline?.status !== 'success' || !Array.isArray(entry.jobs) || entry.jobs.length === 0
    )) issues.push(where + ': passing result lacks evidence')
    if (entry.ok === true && entry.observed === true && object(entry.pipeline) && Array.isArray(entry.jobs) && Array.isArray(entry.approval_rules) && object(entry.policy) && Array.isArray(entry.policy.required_jobs) && policyProblems(entry).length > 0) issues.push(where + ': passing result contradicts declared policy')
  })
  if (typeof report.valid !== 'boolean' || report.valid !== report.results.every((entry) => entry?.ok === true)) issues.push('valid: must match every result')
  return issues
}

function remoteMatches(repositoryPath, host, projectPath) {
  let names
  try {
    names = execFileSync('git', ['-C', repositoryPath, 'remote'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n').filter(Boolean)
  } catch { return false }
  const candidates = new Set()
  for (const name of names) {
    let urls
    try { urls = execFileSync('git', ['-C', repositoryPath, 'remote', 'get-url', '--all', name], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim().split('\n') }
    catch { continue }
    for (const raw of urls) {
      let remoteHost, path
      if (raw.includes('://')) {
        try {
          const url = new URL(raw)
          if (!['https:', 'ssh:'].includes(url.protocol) || url.password || url.search || url.hash || url.port) continue
          remoteHost = url.hostname
          path = url.pathname.replace(/^\//, '')
        } catch { continue }
      } else {
        const match = raw.match(/^(?:[A-Za-z0-9._-]+@)?([A-Za-z0-9.-]+):(.+)$/)
        if (!match) continue
        remoteHost = match[1]
        path = match[2]
      }
      if (remoteHost.toLowerCase() === host) candidates.add(path.replace(/\.git$/, ''))
    }
  }
  return candidates.size === 1 && candidates.has(projectPath)
}

function normalizeApproval(value) {
  if (!object(value) || typeof value.approval_rules_overwritten !== 'boolean' || !Array.isArray(value.rules)) throw new Error('approval rules unavailable')
  const rules = value.rules.filter((rule) => positive(rule?.approvals_required)).map((rule) => {
    if (!positive(rule.id) || typeof rule.name !== 'string' || typeof rule.approved !== 'boolean' || !Array.isArray(rule.approved_by)) throw new Error('approval rule is malformed')
    const ids = rule.approved_by.map((user) => user?.id)
    if (ids.some((id) => !positive(id))) throw new Error('approval identities unavailable')
    return { id: rule.id, name: rule.name, required: rule.approvals_required, approved: rule.approved, approver_ids: [...new Set(ids)].sort((a, b) => a - b) }
  }).sort((a, b) => a.id - b.id)
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) throw new Error('duplicate approval rule id')
  return { overwritten: value.approval_rules_overwritten, rules }
}

function policyProblems(result) {
  const problems = []
  if (result.policy.approval === 'all-positive') {
    if (result.approval_rules_overwritten) problems.push('approval rules are overwritten')
    if (result.approval_rules.length === 0) problems.push('no positive approval rule applies')
    if (result.approval_rules.some((rule) => !rule.approved || rule.approver_ids.length < rule.required || rule.approver_ids.includes(result.mr_author_id))) problems.push('approval rules are unsatisfied or self-approved')
  }
  if (result.pipeline.status !== 'success' ||
    (result.policy.pipeline === 'detached-mr' && result.pipeline.source !== 'merge_request_event')) problems.push('GitLab MR Pipeline does not satisfy declared policy')
  for (const name of result.policy.required_jobs) {
    const matching = result.jobs.filter((job) => job.name === name)
    if (matching.length !== 1 || matching[0].id === null || matching[0].status !== 'success' ||
      matching[0].allow_failure !== false || matching[0].retried === true || matching[0].pipeline_id !== result.pipeline.id) problems.push('required GitLab Job did not pass: ' + name)
  }
  return problems
}

async function readJson(fetchImpl, host, token, path, timeoutMs) {
  let response
  try {
    response = await fetchImpl('https://' + host + '/api/v4/' + path, {
      method: 'GET', redirect: 'error', headers: { 'PRIVATE-TOKEN': token, Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
    })
  } catch { throw new Error('GitLab read failed or timed out') }
  if (!response?.ok) throw new Error('GitLab read returned status ' + (Number.isInteger(response?.status) ? response.status : 'unknown'))
  let content
  try { content = await response.text() } catch { throw new Error('GitLab response unreadable') }
  if (content.length > 1024 * 1024) throw new Error('GitLab response exceeds 1 MiB')
  try { return { value: JSON.parse(content), next: response.headers?.get('x-next-page') ?? '' } }
  catch { throw new Error('GitLab response is not JSON') }
}

async function observeOne(fetchImpl, host, token, target, repository, timeoutMs) {
  const result = {
    repository: target.repository, project_id: target.project_id, project_path: target.project_path,
    mr_iid: target.iid, expected_revision: repository.expected_revision, mr_sha: null, mr_author_id: null,
    approval_rules_overwritten: null, approval_rules: [], pipeline: null, jobs: [],
    policy: { ...(target.policy ?? DEFAULT_POLICY), required_jobs: [...target.required_jobs] }, observed: false, ok: false, problems: [],
  }
  try {
    if (!remoteMatches(repository.path, host, target.project_path)) throw new Error('local repository remote does not match GitLab project')
    const prefix = 'projects/' + target.project_id
    const project = (await readJson(fetchImpl, host, token, prefix, timeoutMs)).value
    if (project?.id !== target.project_id || project?.path_with_namespace !== target.project_path) throw new Error('GitLab project identity mismatch')
    const mrPath = prefix + '/merge_requests/' + target.iid
    const mr = (await readJson(fetchImpl, host, token, mrPath, timeoutMs)).value
    if (mr?.project_id !== target.project_id || mr?.iid !== target.iid || mr?.source_project_id !== target.project_id || mr?.state !== 'opened' || mr?.target_branch !== target.target_branch) throw new Error('GitLab MR identity or target mismatch')
    result.mr_sha = typeof mr.sha === 'string' && COMMIT.test(mr.sha) ? mr.sha : null
    if (mr.sha !== repository.expected_revision) throw new Error('GitLab MR HEAD differs from pinned repository revision')
    if (!positive(mr.author?.id)) throw new Error('GitLab MR author identity unavailable')
    result.mr_author_id = mr.author.id
    const approval = normalizeApproval((await readJson(fetchImpl, host, token, mrPath + '/approval_state', timeoutMs)).value)
    result.approval_rules_overwritten = approval.overwritten
    result.approval_rules = approval.rules
    if (!positive(mr.head_pipeline?.id)) throw new Error('GitLab MR head Pipeline unavailable')
    const pipelineId = mr.head_pipeline.id
    const pipeline = (await readJson(fetchImpl, host, token, prefix + '/pipelines/' + pipelineId, timeoutMs)).value
    result.pipeline = {
      id: positive(pipeline?.id) ? pipeline.id : null,
      sha: typeof pipeline?.sha === 'string' && COMMIT.test(pipeline.sha) ? pipeline.sha : null,
      source: typeof pipeline?.source === 'string' ? pipeline.source : null,
      status: typeof pipeline?.status === 'string' ? pipeline.status : null,
    }
    if (pipeline?.id !== pipelineId || pipeline?.project_id !== target.project_id || pipeline?.sha !== mr.sha) throw new Error('GitLab MR Pipeline identity differs from pinned HEAD')
    const jobs = []
    let page = 1
    for (;;) {
      const batch = await readJson(fetchImpl, host, token, prefix + '/pipelines/' + pipelineId + '/jobs?include_retried=false&per_page=100&page=' + page, timeoutMs)
      if (!Array.isArray(batch.value)) throw new Error('GitLab Pipeline Jobs response is malformed')
      jobs.push(...batch.value)
      if (!batch.next) break
      const next = Number(batch.next)
      if (!Number.isSafeInteger(next) || next !== page + 1 || next > 10) throw new Error('GitLab Job pagination is invalid or exceeds limit')
      page = next
    }
    for (const name of target.required_jobs) {
      const matches = jobs.filter((job) => job?.name === name)
      for (const job of matches) result.jobs.push({
        id: positive(job.id) ? job.id : null, name,
        status: typeof job.status === 'string' ? job.status : null,
        pipeline_id: positive(job.pipeline?.id) ? job.pipeline.id : null,
        allow_failure: typeof job.allow_failure === 'boolean' ? job.allow_failure : null,
        retried: typeof job.retried === 'boolean' ? job.retried : null,
      })
    }
    const mrAfter = (await readJson(fetchImpl, host, token, mrPath, timeoutMs)).value
    if (mrAfter?.sha !== mr.sha || mrAfter?.head_pipeline?.id !== pipelineId || mrAfter?.target_branch !== mr.target_branch || mrAfter?.state !== mr.state) throw new Error('GitLab MR changed during observation')
    const approvalAfter = normalizeApproval((await readJson(fetchImpl, host, token, mrPath + '/approval_state', timeoutMs)).value)
    if (JSON.stringify(approvalAfter) !== JSON.stringify(approval)) throw new Error('GitLab approvals changed during observation')
    result.observed = true
    result.problems.push(...policyProblems(result))
    result.ok = result.problems.length === 0
  } catch (error) {
    result.problems.push(error.message)
  }
  return result
}

export async function observeSystemGitlab(manifestPath, targetsPath, outPath, options = {}) {
  const manifest = resolve(manifestPath)
  const targetsFile = resolve(targetsPath)
  const output = resolve(outPath)
  const check = checkSystemManifest(manifest)
  if (!check.ready) throw new Error('system snapshot is not ready; run system-check')
  const targetsRaw = readFileSync(targetsFile)
  const targets = JSON.parse(targetsRaw)
  const issues = validateGitlabTargets(targets, check)
  if (issues.length > 0) throw new Error('invalid GitLab targets: ' + issues.join('; '))
  if (!validateGitlabHost(options.host)) throw new Error('--host requires an explicit HTTPS GitLab hostname')
  if (typeof options.token !== 'string' || options.token.length === 0) throw new Error('GitLab token is unavailable')
  if (existsSync(output)) throw new Error('GitLab observation already exists; choose another output path')
  const effectiveOutput = resolve(realpathSync(dirname(output)), basename(output))
  if (check.repositories.some((entry) => inside(effectiveOutput, realpathSync(entry.path)))) throw new Error('GitLab observation output must be outside every declared repository')
  const timeoutMs = options.timeoutMs ?? 10000
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60000) throw new Error('GitLab timeout must be 1-60000 ms')
  const fetchImpl = options.fetchImpl ?? fetch
  const repositories = new Map(check.repositories.map((entry) => [entry.id, entry]))
  const results = []
  for (const target of targets.merge_requests) results.push(await observeOne(fetchImpl, options.host, options.token, target, repositories.get(target.repository), timeoutMs))
  const report = {
    schema_version: 'coding-harness.gitlab-observation/v1',
    system_id: check.system.id,
    change_id: check.change.id,
    manifest_sha256: sha256(readFileSync(manifest)),
    targets_sha256: sha256(targetsRaw),
    observed_at: new Date().toISOString(),
    host: options.host,
    results,
    valid: results.every((entry) => entry.ok),
    remote_reads: true,
    commands_executed: false,
    note: 'Read-only GitLab observation; not a signed attestation, merge approval, or CI artifact provenance proof',
  }
  const reportIssues = validateGitlabObservation(report)
  if (reportIssues.length > 0) throw new Error('GitLab observation contract violated: ' + reportIssues.join('; '))
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' })
  return report
}
