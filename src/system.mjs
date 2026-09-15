import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

export const SYSTEM_ROOT_KEYS = ['schema_version', 'id', 'repositories', 'contracts', 'verifications']
export const SYSTEM_REPOSITORY_KEYS = ['id', 'role', 'path', 'revision']
export const SYSTEM_CONTRACT_KEYS = ['id', 'producer', 'consumers', 'evidence']
export const SYSTEM_EVIDENCE_KEYS = ['repository', 'path']
export const SYSTEM_VERIFICATION_KEYS = ['id', 'repository', 'tier', 'command', 'external', 'reviewed_by']
export const SYSTEM_TIERS = ['harness-check', 'unit', 'contract', 'integration', 'external-qualified']

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
      commands_executed: false,
      note: 'declared-ready proves checkout alignment and evidence presence, not command success',
    },
  }
}
