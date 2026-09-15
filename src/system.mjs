import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { sha256 } from './compose.mjs'
import { installForwarding, removeForwarding, runCommand, terminateAll } from './process.mjs'
import { writeAtomic } from './state.mjs'

export const SYSTEM_ROOT_KEYS = ['schema_version', 'id', 'repositories', 'contracts', 'verifications', 'qualification']
export const SYSTEM_REPOSITORY_KEYS = ['id', 'role', 'path', 'revision']
export const SYSTEM_CONTRACT_KEYS = ['id', 'producer', 'consumers', 'evidence']
export const SYSTEM_EVIDENCE_KEYS = ['repository', 'path']
export const SYSTEM_VERIFICATION_KEYS = ['id', 'repository', 'tier', 'command', 'external', 'reviewed_by']
export const SYSTEM_QUALIFICATION_KEYS = ['required_tiers']
export const SYSTEM_TIERS = ['harness-check', 'unit', 'contract', 'integration', 'external-qualified']
export const SYSTEM_RECEIPT_KEYS = ['schema_version', 'system_id', 'manifest', 'tier', 'started_at', 'finished_at', 'repositories', 'results', 'status']
export const SYSTEM_RECEIPT_MANIFEST_KEYS = ['sha256']
export const SYSTEM_RECEIPT_REPOSITORY_KEYS = ['id', 'revision']
export const SYSTEM_RECEIPT_RESULT_KEYS = ['id', 'repository', 'command', 'ok', 'exit_code', 'signal', 'timed_out', 'duration_ms', 'stdout', 'stderr']
export const SYSTEM_RECEIPT_STREAM_KEYS = ['bytes', 'sha256']

const EXTERNAL_SIGNAL = /\b(curl|docker|https?|kubectl|llm|mcp|oauth|openai|provider|socket|ssh|uvicorn)\b/i

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(issues, value, where) {
  if (typeof value !== 'string' || value.length === 0) issues.push(where + ': required non-empty string')
}

function rejectUnknown(issues, value, keys, where) {
  if (!object(value)) return
  for (const key of Object.keys(value)) if (!keys.includes(key)) issues.push(where + '.' + key + ': unknown field')
}

function uniqueIds(issues, values, where) {
  const seen = new Set()
  values.forEach((value, index) => {
    if (typeof value?.id !== 'string') return
    if (seen.has(value.id)) issues.push(where + '[' + index + '].id: duplicate id ' + value.id)
    seen.add(value.id)
  })
}

export function validateSystemManifest(manifest) {
  const issues = []
  if (!object(manifest)) return ['root: required object']
  rejectUnknown(issues, manifest, SYSTEM_ROOT_KEYS, 'root')
  if (manifest.schema_version !== 'coding-harness.system/v1') issues.push('schema_version: must be coding-harness.system/v1')
  requiredString(issues, manifest.id, 'id')

  const repositories = Array.isArray(manifest.repositories) ? manifest.repositories : []
  if (repositories.length === 0) issues.push('repositories: required non-empty array')
  repositories.forEach((entry, index) => {
    const where = 'repositories[' + index + ']'
    if (!object(entry)) { issues.push(where + ': required object'); return }
    rejectUnknown(issues, entry, SYSTEM_REPOSITORY_KEYS, where)
    for (const key of ['id', 'role', 'path']) requiredString(issues, entry[key], where + '.' + key)
    if (entry.revision !== null && (typeof entry.revision !== 'string' || !/^[0-9a-f]{40}$/.test(entry.revision))) issues.push(where + '.revision: required null or a full 40-character lowercase Git commit')
  })
  uniqueIds(issues, repositories, 'repositories')
  const repositoryIds = new Set(repositories.map((entry) => entry?.id).filter((id) => typeof id === 'string'))

  const contracts = Array.isArray(manifest.contracts) ? manifest.contracts : []
  if (!Array.isArray(manifest.contracts)) issues.push('contracts: required array')
  contracts.forEach((entry, index) => {
    const where = 'contracts[' + index + ']'
    if (!object(entry)) { issues.push(where + ': required object'); return }
    rejectUnknown(issues, entry, SYSTEM_CONTRACT_KEYS, where)
    for (const key of ['id', 'producer']) requiredString(issues, entry[key], where + '.' + key)
    if (typeof entry.producer === 'string' && !repositoryIds.has(entry.producer)) issues.push(where + '.producer: unknown repository ' + entry.producer)
    if (!Array.isArray(entry.consumers) || entry.consumers.length === 0) issues.push(where + '.consumers: required non-empty array')
    else entry.consumers.forEach((id, consumerIndex) => {
      requiredString(issues, id, where + '.consumers[' + consumerIndex + ']')
      if (typeof id === 'string' && !repositoryIds.has(id)) issues.push(where + '.consumers[' + consumerIndex + ']: unknown repository ' + id)
      if (id === entry.producer) issues.push(where + '.consumers[' + consumerIndex + ']: producer cannot consume its own contract')
    })
    if (!object(entry.evidence)) issues.push(where + '.evidence: required object')
    else {
      rejectUnknown(issues, entry.evidence, SYSTEM_EVIDENCE_KEYS, where + '.evidence')
      requiredString(issues, entry.evidence.repository, where + '.evidence.repository')
      requiredString(issues, entry.evidence.path, where + '.evidence.path')
      if (typeof entry.evidence.repository === 'string' && !repositoryIds.has(entry.evidence.repository)) issues.push(where + '.evidence.repository: unknown repository ' + entry.evidence.repository)
      if (typeof entry.evidence.path === 'string' && (isAbsolute(entry.evidence.path) || entry.evidence.path.split('/').includes('..'))) issues.push(where + '.evidence.path: must stay inside the evidence repository')
    }
  })
  uniqueIds(issues, contracts, 'contracts')

  const verifications = Array.isArray(manifest.verifications) ? manifest.verifications : []
  if (verifications.length === 0) issues.push('verifications: required non-empty array')
  verifications.forEach((entry, index) => {
    const where = 'verifications[' + index + ']'
    if (!object(entry)) { issues.push(where + ': required object'); return }
    rejectUnknown(issues, entry, SYSTEM_VERIFICATION_KEYS, where)
    for (const key of ['id', 'repository', 'tier', 'command', 'reviewed_by']) requiredString(issues, entry[key], where + '.' + key)
    if (typeof entry.repository === 'string' && !repositoryIds.has(entry.repository)) issues.push(where + '.repository: unknown repository ' + entry.repository)
    if (typeof entry.tier === 'string' && !SYSTEM_TIERS.includes(entry.tier)) issues.push(where + '.tier: must be one of ' + SYSTEM_TIERS.join(', '))
    if (typeof entry.command === 'string') {
      if (entry.command.includes('\n')) issues.push(where + '.command: required single line')
      if (/[*?[\]]/.test(entry.command)) issues.push(where + '.command: wildcards are not executable command arguments')
      if (EXTERNAL_SIGNAL.test(entry.command) && entry.external !== true) issues.push(where + '.external: command has an external-service signal; declare external-qualified and external true')
    }
    if (typeof entry.external !== 'boolean') issues.push(where + '.external: required boolean')
    if (entry.external === true && entry.tier !== 'external-qualified') issues.push(where + '.tier: external commands belong in external-qualified')
    if (entry.tier === 'external-qualified' && entry.external !== true) issues.push(where + '.external: external-qualified requires true')
  })
  uniqueIds(issues, verifications, 'verifications')
  for (const repository of repositories) {
    if (typeof repository?.id === 'string' && !verifications.some((entry) => entry?.repository === repository.id)) issues.push('repositories (' + repository.id + '): has no reviewed verification')
  }
  if (!object(manifest.qualification)) issues.push('qualification: required object')
  else {
    rejectUnknown(issues, manifest.qualification, SYSTEM_QUALIFICATION_KEYS, 'qualification')
    const tiers = manifest.qualification.required_tiers
    if (!Array.isArray(tiers) || tiers.length === 0) issues.push('qualification.required_tiers: required non-empty array')
    else {
      const seen = new Set()
      tiers.forEach((tier, index) => {
        requiredString(issues, tier, 'qualification.required_tiers[' + index + ']')
        if (typeof tier === 'string' && !SYSTEM_TIERS.includes(tier)) issues.push('qualification.required_tiers[' + index + ']: unknown tier ' + tier)
        if (seen.has(tier)) issues.push('qualification.required_tiers[' + index + ']: duplicate tier ' + tier)
        seen.add(tier)
        if (typeof tier === 'string' && !verifications.some((entry) => entry?.tier === tier)) issues.push('qualification.required_tiers[' + index + ']: tier has no reviewed verification ' + tier)
      })
    }
  }
  return issues
}

function git(path, args) {
  try {
    return execFileSync('git', ['-C', path, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return null
  }
}

function commandAvailable(root, command) {
  if (typeof command !== 'string' || command.length === 0 || root === undefined) return false
  const executable = command.trim().split(/\s+/)[0]
  if (executable.includes('/')) return existsSync(resolve(root, executable))
  try {
    execFileSync('sh', ['-c', 'command -v "$1" >/dev/null 2>&1', 'system-check', executable], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function resolveRepository(base, declaredPath) {
  return resolve(base, declaredPath)
}

export function checkSystemManifest(path) {
  const absoluteManifest = resolve(path)
  const manifest = JSON.parse(readFileSync(absoluteManifest, 'utf8'))
  const structuralIssues = validateSystemManifest(manifest)
  const base = dirname(absoluteManifest)
  const repositories = (Array.isArray(manifest.repositories) ? manifest.repositories : []).map((entry) => {
    const path = typeof entry?.path === 'string' ? resolveRepository(base, entry.path) : null
    const exists = path !== null && existsSync(path) && statSync(path).isDirectory()
    const currentRevision = exists ? git(path, ['rev-parse', 'HEAD']) : null
    const status = currentRevision === null ? null : git(path, ['status', '--porcelain=v1'])
    return {
      id: entry?.id ?? null,
      role: entry?.role ?? null,
      declared_path: entry?.path ?? null,
      path,
      exists,
      git: currentRevision !== null,
      expected_revision: entry?.revision ?? null,
      current_revision: currentRevision,
      revision_match: currentRevision !== null && typeof entry?.revision === 'string' && currentRevision === entry.revision,
      clean: status !== null && status.length === 0,
      change_count: status === null || status.length === 0 ? 0 : status.split('\n').length,
    }
  })
  const byId = new Map(repositories.map((entry) => [entry.id, entry]))
  const contracts = (Array.isArray(manifest.contracts) ? manifest.contracts : []).map((entry) => {
    const repository = byId.get(entry?.evidence?.repository)
    const evidencePath = repository?.path && typeof entry?.evidence?.path === 'string'
      ? resolve(repository.path, entry.evidence.path)
      : null
    return {
      id: entry?.id ?? null,
      producer: entry?.producer ?? null,
      consumers: entry?.consumers ?? [],
      evidence: entry?.evidence ?? null,
      evidence_path: evidencePath,
      evidence_exists: evidencePath !== null && existsSync(evidencePath),
    }
  })
  const verifications = (Array.isArray(manifest.verifications) ? manifest.verifications : []).map((entry) => {
    const repository = byId.get(entry?.repository)
    return {
      ...entry,
      reviewed: typeof entry?.reviewed_by === 'string' && entry.reviewed_by.length > 0,
      executable_resolvable: commandAvailable(repository?.path, entry?.command),
      executed: false,
    }
  })
  const ready = structuralIssues.length === 0
    && repositories.every((entry) => entry.exists && entry.git && entry.revision_match && entry.clean)
    && contracts.every((entry) => entry.evidence_exists)
    && verifications.every((entry) => entry.executable_resolvable)
  return {
    schema_version: 'coding-harness.system-check/v1',
    system: { id: manifest?.id ?? null, manifest: absoluteManifest },
    structural: { valid: structuralIssues.length === 0, issues: structuralIssues },
    repositories,
    contracts,
    verifications,
    ready,
    qualification: {
      status: ready ? 'declared-ready' : 'not-ready',
      required_tiers: manifest?.qualification?.required_tiers ?? [],
      commands_executed: false,
      note: 'declared-ready proves checkout alignment and evidence presence, not command success',
    },
  }
}

function inside(path, root) {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))
}

function streamReceipt(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

export async function runSystemTier(manifestPath, tier, outPath, options = {}) {
  if (!SYSTEM_TIERS.includes(tier)) throw new Error('tier must be one of ' + SYSTEM_TIERS.join(', '))
  if (tier === 'external-qualified' && options.allowExternal !== true) throw new Error('external-qualified requires --allow-external')
  const check = checkSystemManifest(manifestPath)
  if (!check.ready) throw new Error('system snapshot is not ready; run system-check')
  const selected = check.verifications.filter((entry) => entry.tier === tier)
  if (selected.length === 0) throw new Error('no reviewed verifications declared for tier ' + tier)
  const out = resolve(outPath)
  if (existsSync(out) && options.force !== true) throw new Error('receipt already exists; choose another path or pass --force')
  const repositoryPaths = new Map(check.repositories.map((entry) => [entry.id, entry.path]))
  if (check.repositories.some((entry) => inside(out, entry.path))) throw new Error('receipt output must be outside every declared repository')
  const rawManifest = readFileSync(resolve(manifestPath))
  const startedAt = new Date().toISOString()
  const results = []
  installForwarding()
  try {
    for (const verification of selected) {
      const result = await runCommand(repositoryPaths.get(verification.repository), verification.command, options.timeoutMs ?? 300000)
      if (typeof options.onOutput === 'function') options.onOutput(verification, result)
      results.push({
        id: verification.id,
        repository: verification.repository,
        command: verification.command,
        ok: result.code === 0 && !result.timedOut,
        exit_code: result.code,
        signal: result.signal,
        timed_out: result.timedOut,
        duration_ms: result.ms,
        stdout: streamReceipt(result.stdout),
        stderr: streamReceipt(result.stderr),
      })
    }
  } finally {
    removeForwarding()
    terminateAll('SIGKILL')
  }
  const passed = results.every((entry) => entry.ok)
  const receipt = {
    schema_version: 'coding-harness.system-receipt/v1',
    system_id: check.system.id,
    manifest: { sha256: sha256(rawManifest) },
    tier,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    repositories: check.repositories.map((entry) => ({ id: entry.id, revision: entry.current_revision })),
    results,
    status: passed ? 'passed' : 'failed',
  }
  writeAtomic(out, JSON.stringify(receipt, null, 2) + '\n')
  return receipt
}

function receiptString(issues, value, where) {
  if (typeof value !== 'string' || value.length === 0) issues.push(where + ': required non-empty string')
}

export function validateSystemReceipt(receipt) {
  const issues = []
  if (!object(receipt)) return ['root: required object']
  rejectUnknown(issues, receipt, SYSTEM_RECEIPT_KEYS, 'root')
  if (receipt.schema_version !== 'coding-harness.system-receipt/v1') issues.push('schema_version: must be coding-harness.system-receipt/v1')
  for (const key of ['system_id', 'tier', 'started_at', 'finished_at', 'status']) receiptString(issues, receipt[key], key)
  if (!SYSTEM_TIERS.includes(receipt.tier)) issues.push('tier: must be one of ' + SYSTEM_TIERS.join(', '))
  if (!['passed', 'failed'].includes(receipt.status)) issues.push('status: must be passed or failed')
  const started = Date.parse(receipt.started_at)
  const finished = Date.parse(receipt.finished_at)
  if (!Number.isFinite(started)) issues.push('started_at: required timestamp')
  if (!Number.isFinite(finished)) issues.push('finished_at: required timestamp')
  if (Number.isFinite(started) && Number.isFinite(finished) && finished < started) issues.push('finished_at: cannot precede started_at')
  if (!object(receipt.manifest)) issues.push('manifest: required object')
  else {
    rejectUnknown(issues, receipt.manifest, SYSTEM_RECEIPT_MANIFEST_KEYS, 'manifest')
    for (const key of SYSTEM_RECEIPT_MANIFEST_KEYS) receiptString(issues, receipt.manifest[key], 'manifest.' + key)
    if (typeof receipt.manifest.sha256 === 'string' && !/^[0-9a-f]{64}$/.test(receipt.manifest.sha256)) issues.push('manifest.sha256: required SHA-256')
  }
  if (!Array.isArray(receipt.repositories) || receipt.repositories.length === 0) issues.push('repositories: required non-empty array')
  else receipt.repositories.forEach((entry, index) => {
    const where = 'repositories[' + index + ']'
    if (!object(entry)) { issues.push(where + ': required object'); return }
    rejectUnknown(issues, entry, SYSTEM_RECEIPT_REPOSITORY_KEYS, where)
    for (const key of SYSTEM_RECEIPT_REPOSITORY_KEYS) receiptString(issues, entry[key], where + '.' + key)
    if (typeof entry.revision === 'string' && !/^[0-9a-f]{40}$/.test(entry.revision)) issues.push(where + '.revision: required full Git commit')
  })
  uniqueIds(issues, Array.isArray(receipt.repositories) ? receipt.repositories : [], 'repositories')
  const results = Array.isArray(receipt.results) ? receipt.results : []
  if (results.length === 0) issues.push('results: required non-empty array')
  results.forEach((entry, index) => {
    const where = 'results[' + index + ']'
    if (!object(entry)) { issues.push(where + ': required object'); return }
    rejectUnknown(issues, entry, SYSTEM_RECEIPT_RESULT_KEYS, where)
    for (const key of ['id', 'repository', 'command']) receiptString(issues, entry[key], where + '.' + key)
    for (const key of ['ok', 'timed_out']) if (typeof entry[key] !== 'boolean') issues.push(where + '.' + key + ': required boolean')
    for (const key of ['exit_code', 'duration_ms']) if (!Number.isInteger(entry[key]) || entry[key] < 0) issues.push(where + '.' + key + ': required integer >= 0')
    if (entry.signal !== null && typeof entry.signal !== 'string') issues.push(where + '.signal: required string or null')
    for (const stream of ['stdout', 'stderr']) {
      const value = entry[stream]
      if (!object(value)) { issues.push(where + '.' + stream + ': required object'); continue }
      rejectUnknown(issues, value, SYSTEM_RECEIPT_STREAM_KEYS, where + '.' + stream)
      if (!Number.isInteger(value.bytes) || value.bytes < 0) issues.push(where + '.' + stream + '.bytes: required integer >= 0')
      if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) issues.push(where + '.' + stream + '.sha256: required SHA-256')
    }
    if (entry.ok === true && (entry.exit_code !== 0 || entry.timed_out === true)) issues.push(where + ': ok result must exit zero without timing out')
  })
  uniqueIds(issues, results, 'results')
  if (receipt.status === 'passed' && results.some((entry) => entry?.ok !== true)) issues.push('status: passed requires every result to pass')
  if (receipt.status === 'failed' && results.length > 0 && results.every((entry) => entry?.ok === true)) issues.push('status: failed requires a failed result')
  return issues
}

export function checkSystemReceipt(manifestPath, receiptPath) {
  const receipt = JSON.parse(readFileSync(resolve(receiptPath), 'utf8'))
  const problems = validateSystemReceipt(receipt)
  const absoluteManifest = resolve(manifestPath)
  const check = checkSystemManifest(absoluteManifest)
  if (receipt?.manifest?.sha256 !== sha256(readFileSync(absoluteManifest))) problems.push('manifest hash does not match receipt')
  if (receipt?.system_id !== check.system.id) problems.push('system id does not match manifest')
  const expectedRepositories = check.repositories.map((entry) => ({ id: entry.id, revision: entry.current_revision }))
  if (JSON.stringify(receipt?.repositories) !== JSON.stringify(expectedRepositories)) problems.push('repository revision set does not match current snapshot')
  const expectedResults = check.verifications.filter((entry) => entry.tier === receipt?.tier).map((entry) => ({ id: entry.id, repository: entry.repository, command: entry.command }))
  const receiptResults = Array.isArray(receipt?.results) ? receipt.results : []
  const actualResults = receiptResults.map((entry) => ({ id: entry?.id, repository: entry?.repository, command: entry?.command }))
  if (JSON.stringify(actualResults) !== JSON.stringify(expectedResults)) problems.push('receipt commands do not match selected tier')
  if (receipt?.status !== 'passed' || receiptResults.some((entry) => entry?.ok !== true)) problems.push('receipt does not contain a passing run')
  if (!check.ready) problems.push('system snapshot is no longer ready')
  return {
    schema_version: 'coding-harness.system-receipt-check/v1',
    system_id: check.system.id,
    receipt: resolve(receiptPath),
    valid: problems.length === 0,
    problems,
  }
}

export function systemCiReport(manifestPath, receiptsDir, options = {}) {
  const absoluteManifest = resolve(manifestPath)
  const enforce = options.enforce === true
  let check
  try {
    check = checkSystemManifest(absoluteManifest)
  } catch (error) {
    return {
      schema_version: 'coding-harness.system-ci/v1',
      mode: enforce ? 'enforce' : 'shadow',
      system_id: null,
      system_ready: false,
      system_problems: [error.message],
      receipts: [],
      healthy: false,
      would_block: true,
      blocking: enforce,
      commands_executed: false,
    }
  }
  const systemProblems = [...check.structural.issues]
  for (const repository of check.repositories) {
    if (!repository.exists) systemProblems.push('repository missing: ' + repository.id)
    else if (!repository.git) systemProblems.push('repository is not Git: ' + repository.id)
    else if (!repository.revision_match) systemProblems.push('repository revision mismatch: ' + repository.id)
    if (repository.git && !repository.clean) systemProblems.push('repository is dirty: ' + repository.id)
  }
  for (const contract of check.contracts) if (!contract.evidence_exists) systemProblems.push('contract evidence missing: ' + contract.id)
  for (const verification of check.verifications) if (!verification.executable_resolvable) systemProblems.push('verification executable unresolved: ' + verification.id)
  const tiers = check.qualification.required_tiers
  const receipts = tiers.map((tier) => {
    const path = resolve(receiptsDir, tier + '.receipt.json')
    if (!existsSync(path)) return { tier, path, present: false, valid: false, problems: ['receipt missing'] }
    try {
      const report = checkSystemReceipt(absoluteManifest, path)
      const receipt = JSON.parse(readFileSync(path, 'utf8'))
      const problems = [...report.problems]
      if (receipt.tier !== tier) problems.push('receipt tier does not match required tier ' + tier)
      return { tier, path, present: true, valid: problems.length === 0, problems }
    } catch (error) {
      return { tier, path, present: true, valid: false, problems: [error.message] }
    }
  })
  const healthy = check.ready && tiers.length > 0 && receipts.every((entry) => entry.valid)
  return {
    schema_version: 'coding-harness.system-ci/v1',
    mode: enforce ? 'enforce' : 'shadow',
    system_id: check.system.id,
    system_ready: check.ready,
    system_problems: systemProblems,
    receipts,
    healthy,
    would_block: !healthy,
    blocking: enforce && !healthy,
    commands_executed: false,
  }
}
