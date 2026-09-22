import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { sha256 } from './compose.mjs'
import { installForwarding, removeForwarding, runCommand, terminateAll } from './process.mjs'
import { writeAtomic } from './state.mjs'

export const SYSTEM_ROOT_KEYS = ['schema_version', 'id', 'repositories', 'contracts', 'verifications', 'qualification', 'change']
export const SYSTEM_CHANGE_KEYS = ['id', 'records']
export const SYSTEM_CHANGE_RECORD_KEYS = ['repository', 'path']
export const SYSTEM_REPOSITORY_KEYS = ['id', 'role', 'path', 'revision']
export const SYSTEM_CONTRACT_KEYS = ['id', 'producer', 'consumers', 'evidence']
export const SYSTEM_EVIDENCE_KEYS = ['repository', 'path']
export const SYSTEM_VERIFICATION_KEYS = ['id', 'repository', 'tier', 'command', 'external', 'reviewed_by']
export const SYSTEM_QUALIFICATION_KEYS = ['required_tiers', 'max_receipt_age_seconds', 'promotion']
export const SYSTEM_PROMOTION_KEYS = ['history_window', 'minimum_runs', 'minimum_healthy_rate', 'minimum_consecutive_healthy_runs']
export const SYSTEM_TIERS = ['harness-check', 'unit', 'contract', 'integration', 'external-qualified']
export const SYSTEM_RECEIPT_KEYS = ['schema_version', 'system_id', 'change_id', 'manifest', 'tier', 'started_at', 'finished_at', 'repositories', 'results', 'status']
export const SYSTEM_RECEIPT_MANIFEST_KEYS = ['sha256']
export const SYSTEM_RECEIPT_REPOSITORY_KEYS = ['id', 'revision']
export const SYSTEM_RECEIPT_RESULT_KEYS = ['id', 'repository', 'command', 'ok', 'exit_code', 'signal', 'timed_out', 'duration_ms', 'stdout', 'stderr']
export const SYSTEM_RECEIPT_STREAM_KEYS = ['bytes', 'sha256']
export const SYSTEM_CI_REPORT_KEYS = ['schema_version', 'mode', 'system_id', 'observed_at', 'system_ready', 'system_problems', 'receipts', 'healthy', 'would_block', 'blocking', 'commands_executed', 'history']
export const SYSTEM_CI_RECEIPT_KEYS = ['tier', 'path', 'present', 'finished_at', 'age_seconds', 'fresh', 'valid', 'problems']
export const SYSTEM_CI_HISTORY_KEYS = ['path', 'available', 'window', 'prior_observations', 'ignored_files', 'sample_size', 'healthy_runs', 'healthy_rate', 'consecutive_healthy_runs', 'promotion_eligible', 'promotion_problems']

const EXTERNAL_SIGNAL = /\b(curl|docker|https?|kubectl|llm|mcp|oauth|openai|provider|socket|ssh|uvicorn)\b/i
const CHANGE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

function safeRecordPath(path) {
  return typeof path === 'string' && path.length > 0 && !isAbsolute(path)
    && !/[\\:\x00-\x1f\x7f]/.test(path)
    && path.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}

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

  if (manifest.change !== undefined) {
    if (!object(manifest.change)) issues.push('change: required object')
    else {
      rejectUnknown(issues, manifest.change, SYSTEM_CHANGE_KEYS, 'change')
      if (typeof manifest.change.id !== 'string' || !CHANGE_ID.test(manifest.change.id)) issues.push('change.id: required safe single-line Change ID')
      if (!Array.isArray(manifest.change.records) || manifest.change.records.length === 0) issues.push('change.records: required non-empty array')
      else {
        const seen = new Set()
        manifest.change.records.forEach((record, index) => {
          const where = 'change.records[' + index + ']'
          if (!object(record)) { issues.push(where + ': required object'); return }
          rejectUnknown(issues, record, SYSTEM_CHANGE_RECORD_KEYS, where)
          requiredString(issues, record.repository, where + '.repository')
          requiredString(issues, record.path, where + '.path')
          if (typeof record.repository === 'string' && !repositoryIds.has(record.repository)) issues.push(where + '.repository: unknown repository ' + record.repository)
          if (typeof record.repository === 'string' && seen.has(record.repository)) issues.push(where + '.repository: duplicate repository ' + record.repository)
          seen.add(record.repository)
          if (!safeRecordPath(record.path)) issues.push(where + '.path: must be a safe repository-relative path')
        })
      }
    }
  }

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
    if (!Number.isInteger(manifest.qualification.max_receipt_age_seconds) || manifest.qualification.max_receipt_age_seconds < 1) issues.push('qualification.max_receipt_age_seconds: required integer >= 1')
    const promotion = manifest.qualification.promotion
    if (!object(promotion)) issues.push('qualification.promotion: required object')
    else {
      rejectUnknown(issues, promotion, SYSTEM_PROMOTION_KEYS, 'qualification.promotion')
      for (const key of ['history_window', 'minimum_runs', 'minimum_consecutive_healthy_runs']) {
        if (!Number.isInteger(promotion[key]) || promotion[key] < 1) issues.push('qualification.promotion.' + key + ': required integer >= 1')
      }
      if (typeof promotion.minimum_healthy_rate !== 'number' || !Number.isFinite(promotion.minimum_healthy_rate) || promotion.minimum_healthy_rate < 0 || promotion.minimum_healthy_rate > 1) issues.push('qualification.promotion.minimum_healthy_rate: required number from 0 to 1')
      if (Number.isInteger(promotion.minimum_runs) && Number.isInteger(promotion.history_window) && promotion.minimum_runs > promotion.history_window) issues.push('qualification.promotion.minimum_runs: cannot exceed history_window')
      if (Number.isInteger(promotion.minimum_consecutive_healthy_runs) && Number.isInteger(promotion.history_window) && promotion.minimum_consecutive_healthy_runs > promotion.history_window) issues.push('qualification.promotion.minimum_consecutive_healthy_runs: cannot exceed history_window')
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

function gitFile(path, revision, file) {
  try {
    return execFileSync('git', ['-C', path, 'show', revision + ':' + file], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
    })
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

function inspectSystemManifest(manifest, absoluteManifest) {
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
  const change = manifest.change === undefined ? null : {
    id: manifest.change?.id ?? null,
    records: (Array.isArray(manifest.change?.records) ? manifest.change.records : []).map((record) => {
      const repository = byId.get(record?.repository)
      const revision = repository?.expected_revision
      const path = record?.path
      const safe = safeRecordPath(path)
      const treeEntry = repository?.git && /^[0-9a-f]{40}$/.test(revision ?? '') && safe
        ? git(repository.path, ['ls-tree', revision, '--', path]) : null
      const tracked = treeEntry !== null && /^100(644|755) blob [0-9a-f]{40}\t/.test(treeEntry)
        && treeEntry.slice(treeEntry.indexOf('\t') + 1) === path
      const content = tracked ? gitFile(repository.path, revision, path) : null
      return {
        repository: record?.repository ?? null,
        path: path ?? null,
        revision: revision ?? null,
        tracked: tracked && content !== null,
        change_id_match: content !== null && content.split(/\r?\n/).includes('Change-ID: ' + manifest.change.id),
      }
    }),
  }
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
    && (change === null || change.records.length > 0 && change.records.every((entry) => entry.tracked && entry.change_id_match))
    && verifications.every((entry) => entry.executable_resolvable)
  return {
    schema_version: 'coding-harness.system-check/v1',
    system: { id: manifest?.id ?? null, manifest: absoluteManifest },
    structural: { valid: structuralIssues.length === 0, issues: structuralIssues },
    repositories,
    change,
    contracts,
    verifications,
    ready,
    qualification: {
      status: ready ? 'declared-ready' : 'not-ready',
      required_tiers: manifest?.qualification?.required_tiers ?? [],
      max_receipt_age_seconds: manifest?.qualification?.max_receipt_age_seconds ?? null,
      promotion: manifest?.qualification?.promotion ?? null,
      commands_executed: false,
      note: 'declared-ready proves checkout alignment and evidence presence, not command success',
    },
  }
}

export function checkSystemManifest(path) {
  const absoluteManifest = resolve(path)
  return inspectSystemManifest(JSON.parse(readFileSync(absoluteManifest, 'utf8')), absoluteManifest)
}

function inside(path, root) {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))
}

export function materializeSystemSnapshot(declarationPath, revisions, outPath) {
  const source = resolve(declarationPath)
  const output = resolve(outPath)
  const declaration = JSON.parse(readFileSync(source, 'utf8'))
  const issues = validateSystemManifest(declaration)
  if (issues.length > 0) throw new Error('invalid system declaration: ' + issues.join('; '))
  if (existsSync(output)) throw new Error('snapshot already exists; choose another output path')

  const repositories = new Map(declaration.repositories.map((entry) => [entry.id, entry]))
  const bindings = new Map()
  for (const item of revisions) {
    if (typeof item !== 'string' || !/^[^=]+=[0-9a-f]{40}$/.test(item)) throw new Error('--bind requires <id>=<full-lowercase-sha>')
    const index = item.indexOf('=')
    const id = item.slice(0, index)
    const revision = item.slice(index + 1)
    if (!repositories.has(id)) throw new Error('unknown repository binding: ' + id)
    if (bindings.has(id)) throw new Error('duplicate repository binding: ' + id)
    if (repositories.get(id).revision !== null) throw new Error('repository already has a declared revision: ' + id)
    bindings.set(id, revision)
  }
  for (const entry of declaration.repositories) {
    if (entry.revision === null && !bindings.has(entry.id)) throw new Error('missing explicit revision binding: ' + entry.id)
  }

  const sourceDir = dirname(source)
  const outputDir = dirname(output)
  const effectiveOutput = resolve(realpathSync(outputDir), basename(output))
  const snapshot = {
    ...declaration,
    repositories: declaration.repositories.map((entry) => {
      const repositoryPath = resolve(sourceDir, entry.path)
      const effectiveRepository = existsSync(repositoryPath) ? realpathSync(repositoryPath) : repositoryPath
      if (inside(effectiveOutput, effectiveRepository)) throw new Error('snapshot output must be outside every declared repository')
      return {
        ...entry,
        path: relative(outputDir, repositoryPath) || '.',
        revision: entry.revision ?? bindings.get(entry.id),
      }
    }),
  }
  const report = inspectSystemManifest(snapshot, output)
  if (!report.ready) throw new Error('pinned system snapshot is not ready; check revisions, clean trees, contract evidence, and reviewed commands')
  writeFileSync(output, JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' })
  return { snapshot: output, system_id: snapshot.id, repositories: report.repositories.map(({ id, current_revision }) => ({ id, revision: current_revision })), ready: true, commands_executed: false }
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
    ...(check.change === null ? {} : { change_id: check.change.id }),
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
  if (receipt.change_id !== undefined && (typeof receipt.change_id !== 'string' || !CHANGE_ID.test(receipt.change_id))) issues.push('change_id: required safe single-line Change ID')
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
  if (receipt?.change_id !== (check.change?.id ?? undefined)) problems.push('change id does not match manifest')
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

function stringArray(issues, value, where) {
  if (!Array.isArray(value)) { issues.push(where + ': required array'); return }
  value.forEach((entry, index) => receiptString(issues, entry, where + '[' + index + ']'))
}

export function validateSystemCiReport(report) {
  const issues = []
  if (!object(report)) return ['root: required object']
  rejectUnknown(issues, report, SYSTEM_CI_REPORT_KEYS, 'root')
  if (report.schema_version !== 'coding-harness.system-ci/v1') issues.push('schema_version: must be coding-harness.system-ci/v1')
  if (!['shadow', 'enforce'].includes(report.mode)) issues.push('mode: must be shadow or enforce')
  if (report.system_id !== null) receiptString(issues, report.system_id, 'system_id')
  if (!Number.isFinite(Date.parse(report.observed_at))) issues.push('observed_at: required timestamp')
  for (const key of ['system_ready', 'healthy', 'would_block', 'blocking', 'commands_executed']) if (typeof report[key] !== 'boolean') issues.push(key + ': required boolean')
  stringArray(issues, report.system_problems, 'system_problems')
  if (!Array.isArray(report.receipts)) issues.push('receipts: required array')
  else report.receipts.forEach((entry, index) => {
    const where = 'receipts[' + index + ']'
    if (!object(entry)) { issues.push(where + ': required object'); return }
    rejectUnknown(issues, entry, SYSTEM_CI_RECEIPT_KEYS, where)
    for (const key of ['tier', 'path']) receiptString(issues, entry[key], where + '.' + key)
    if (!SYSTEM_TIERS.includes(entry.tier)) issues.push(where + '.tier: unknown tier')
    for (const key of ['present', 'fresh', 'valid']) if (typeof entry[key] !== 'boolean') issues.push(where + '.' + key + ': required boolean')
    if (entry.finished_at !== null && !Number.isFinite(Date.parse(entry.finished_at))) issues.push(where + '.finished_at: required timestamp or null')
    if (entry.age_seconds !== null && (typeof entry.age_seconds !== 'number' || !Number.isFinite(entry.age_seconds))) issues.push(where + '.age_seconds: required finite number or null')
    stringArray(issues, entry.problems, where + '.problems')
    if (entry.valid === true && (entry.present !== true || entry.fresh !== true || !Array.isArray(entry.problems) || entry.problems.length !== 0)) issues.push(where + ': valid requires present fresh evidence without problems')
  })
  const history = report.history
  if (!object(history)) issues.push('history: required object')
  else {
    rejectUnknown(issues, history, SYSTEM_CI_HISTORY_KEYS, 'history')
    if (history.path !== null) receiptString(issues, history.path, 'history.path')
    for (const key of ['available', 'promotion_eligible']) if (typeof history[key] !== 'boolean') issues.push('history.' + key + ': required boolean')
    for (const key of ['window', 'prior_observations', 'ignored_files', 'sample_size', 'healthy_runs', 'consecutive_healthy_runs']) if (!Number.isInteger(history[key]) || history[key] < 0) issues.push('history.' + key + ': required integer >= 0')
    if (history.healthy_rate !== null && (typeof history.healthy_rate !== 'number' || !Number.isFinite(history.healthy_rate) || history.healthy_rate < 0 || history.healthy_rate > 1)) issues.push('history.healthy_rate: required number from 0 to 1 or null')
    stringArray(issues, history.promotion_problems, 'history.promotion_problems')
    if (history.promotion_eligible === true && (!Array.isArray(history.promotion_problems) || history.promotion_problems.length !== 0)) issues.push('history: promotion eligible requires no promotion problems')
  }
  if (report.would_block !== !report.healthy) issues.push('would_block: must be the inverse of healthy')
  if (report.blocking !== (report.mode === 'enforce' && !report.healthy)) issues.push('blocking: must reflect enforce mode and current health')
  if (report.commands_executed !== false) issues.push('commands_executed: system CI must remain read-only')
  return issues
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
      observed_at: new Date(options.now ?? Date.now()).toISOString(),
      system_ready: false,
      system_problems: [error.message],
      receipts: [],
      healthy: false,
      would_block: true,
      blocking: enforce,
      commands_executed: false,
      history: {
        path: options.historyDir === undefined ? null : resolve(options.historyDir),
        available: false,
        window: 0,
        prior_observations: 0,
        ignored_files: 0,
        sample_size: 0,
        healthy_runs: 0,
        healthy_rate: null,
        consecutive_healthy_runs: 0,
        promotion_eligible: false,
        promotion_problems: ['system manifest unavailable'],
      },
    }
  }
  const now = new Date(options.now ?? Date.now())
  if (!Number.isFinite(now.getTime())) throw new Error('system-ci now must be a valid timestamp')
  const systemProblems = [...check.structural.issues]
  for (const repository of check.repositories) {
    if (!repository.exists) systemProblems.push('repository missing: ' + repository.id)
    else if (!repository.git) systemProblems.push('repository is not Git: ' + repository.id)
    else if (!repository.revision_match) systemProblems.push('repository revision mismatch: ' + repository.id)
    if (repository.git && !repository.clean) systemProblems.push('repository is dirty: ' + repository.id)
  }
  for (const contract of check.contracts) if (!contract.evidence_exists) systemProblems.push('contract evidence missing: ' + contract.id)
  for (const record of check.change?.records ?? []) {
    if (!record.tracked) systemProblems.push('change record missing at pinned revision: ' + record.repository + ':' + record.path)
    else if (!record.change_id_match) systemProblems.push('change id missing from pinned record: ' + record.repository + ':' + record.path)
  }
  for (const verification of check.verifications) if (!verification.executable_resolvable) systemProblems.push('verification executable unresolved: ' + verification.id)
  const tiers = check.qualification.required_tiers
  const maxReceiptAgeSeconds = Number.isInteger(check.qualification.max_receipt_age_seconds) && check.qualification.max_receipt_age_seconds >= 1
    ? check.qualification.max_receipt_age_seconds
    : null
  const receipts = tiers.map((tier) => {
    const path = resolve(receiptsDir, tier + '.receipt.json')
    if (!existsSync(path)) return { tier, path, present: false, finished_at: null, age_seconds: null, fresh: false, valid: false, problems: ['receipt missing'] }
    try {
      const report = checkSystemReceipt(absoluteManifest, path)
      const receipt = JSON.parse(readFileSync(path, 'utf8'))
      const problems = [...report.problems]
      if (receipt.tier !== tier) problems.push('receipt tier does not match required tier ' + tier)
      const finishedAt = Date.parse(receipt.finished_at)
      const ageSeconds = Number.isFinite(finishedAt) ? (now.getTime() - finishedAt) / 1000 : null
      if (maxReceiptAgeSeconds === null) problems.push('receipt age budget unavailable')
      if (ageSeconds !== null && ageSeconds < 0) problems.push('receipt finished_at is in the future')
      if (ageSeconds !== null && maxReceiptAgeSeconds !== null && ageSeconds > maxReceiptAgeSeconds) problems.push('receipt exceeds max age of ' + maxReceiptAgeSeconds + ' seconds')
      return {
        tier,
        path,
        present: true,
        finished_at: Number.isFinite(finishedAt) ? receipt.finished_at : null,
        age_seconds: ageSeconds,
        fresh: ageSeconds !== null && maxReceiptAgeSeconds !== null && ageSeconds >= 0 && ageSeconds <= maxReceiptAgeSeconds,
        valid: problems.length === 0,
        problems,
      }
    } catch (error) {
      return { tier, path, present: true, finished_at: null, age_seconds: null, fresh: false, valid: false, problems: [error.message] }
    }
  })
  const healthy = check.ready && tiers.length > 0 && receipts.every((entry) => entry.valid)
  const observedAt = now.toISOString()
  const historyPath = options.historyDir === undefined ? null : resolve(options.historyDir)
  const historyAvailable = historyPath !== null && existsSync(historyPath) && statSync(historyPath).isDirectory()
  const previous = []
  let ignoredFiles = 0
  if (historyAvailable) {
    for (const name of readdirSync(historyPath).filter((entry) => entry.endsWith('.json')).sort()) {
      try {
        const value = JSON.parse(readFileSync(resolve(historyPath, name), 'utf8'))
        const observed = Date.parse(value.observed_at)
        if (validateSystemCiReport(value).length !== 0 || value.system_id !== check.system.id || observed > now.getTime()) ignoredFiles += 1
        else previous.push({ observed_at: value.observed_at, healthy: value.healthy })
      } catch {
        ignoredFiles += 1
      }
    }
  }
  const declaredPolicy = check.qualification.promotion
  const policyValid = object(declaredPolicy)
    && Number.isInteger(declaredPolicy.history_window) && declaredPolicy.history_window >= 1
    && Number.isInteger(declaredPolicy.minimum_runs) && declaredPolicy.minimum_runs >= 1 && declaredPolicy.minimum_runs <= declaredPolicy.history_window
    && typeof declaredPolicy.minimum_healthy_rate === 'number' && Number.isFinite(declaredPolicy.minimum_healthy_rate) && declaredPolicy.minimum_healthy_rate >= 0 && declaredPolicy.minimum_healthy_rate <= 1
    && Number.isInteger(declaredPolicy.minimum_consecutive_healthy_runs) && declaredPolicy.minimum_consecutive_healthy_runs >= 1 && declaredPolicy.minimum_consecutive_healthy_runs <= declaredPolicy.history_window
  const policy = policyValid ? declaredPolicy : {
    history_window: 1,
    minimum_runs: 1,
    minimum_healthy_rate: 1,
    minimum_consecutive_healthy_runs: 1,
  }
  const observations = [...previous, { observed_at: observedAt, healthy }]
    .sort((left, right) => Date.parse(left.observed_at) - Date.parse(right.observed_at))
    .slice(-policy.history_window)
  const healthyRuns = observations.filter((entry) => entry.healthy).length
  let consecutiveHealthyRuns = 0
  for (let index = observations.length - 1; index >= 0 && observations[index].healthy; index -= 1) consecutiveHealthyRuns += 1
  const healthyRate = observations.length === 0 ? null : healthyRuns / observations.length
  const promotionProblems = policyValid ? [] : ['qualification promotion policy invalid']
  if (observations.length < policy.minimum_runs) promotionProblems.push('needs at least ' + policy.minimum_runs + ' observations')
  if (healthyRate === null || healthyRate < policy.minimum_healthy_rate) promotionProblems.push('healthy rate is below ' + policy.minimum_healthy_rate)
  if (consecutiveHealthyRuns < policy.minimum_consecutive_healthy_runs) promotionProblems.push('needs at least ' + policy.minimum_consecutive_healthy_runs + ' consecutive healthy observations')
  return {
    schema_version: 'coding-harness.system-ci/v1',
    mode: enforce ? 'enforce' : 'shadow',
    system_id: check.system.id,
    observed_at: observedAt,
    system_ready: check.ready,
    system_problems: systemProblems,
    receipts,
    healthy,
    would_block: !healthy,
    blocking: enforce && !healthy,
    commands_executed: false,
    history: {
      path: historyPath,
      available: historyAvailable,
      window: policy.history_window,
      prior_observations: previous.length,
      ignored_files: ignoredFiles,
      sample_size: observations.length,
      healthy_runs: healthyRuns,
      healthy_rate: healthyRate,
      consecutive_healthy_runs: consecutiveHealthyRuns,
      promotion_eligible: promotionProblems.length === 0,
      promotion_problems: promotionProblems,
    },
  }
}
