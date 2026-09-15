import { execFileSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  readdirSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { sha256 } from './compose.mjs'
import { installForwarding, removeForwarding, runCommand, terminateAll } from './process.mjs'
import { writeAtomic } from './state.mjs'

export const COMMAND_REVIEW_KEYS = [
  'schema_version',
  'repository',
  'command',
  'started_at',
  'finished_at',
  'isolation',
  'result',
  'filesystem',
  'observability',
  'status',
  'authorizes_verification',
]
export const COMMAND_REVIEW_REPOSITORY_KEYS = ['path', 'revision']
export const COMMAND_REVIEW_ISOLATION_KEYS = ['mode', 'temporary_directory_removed']
export const COMMAND_REVIEW_RESULT_KEYS = ['ok', 'exit_code', 'signal', 'timed_out', 'duration_ms', 'stdout', 'stderr']
export const COMMAND_REVIEW_STREAM_KEYS = ['bytes', 'sha256']
export const COMMAND_REVIEW_FILESYSTEM_KEYS = ['scope', 'before_sha256', 'after_sha256', 'added', 'modified', 'removed']
export const COMMAND_REVIEW_OBSERVABILITY_KEYS = ['filesystem', 'network', 'child_processes', 'outside_tree_writes', 'external_execution_allowed']

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

function inside(path, root) {
  const rel = relative(root, path)
  return rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))
}

function streamReceipt(value) {
  return { bytes: Buffer.byteLength(value), sha256: sha256(value) }
}

function revisionAt(repository, revision) {
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('--revision must be a full 40-character lowercase Git commit')
  try {
    return execFileSync('git', ['-C', repository, 'rev-parse', '--verify', revision + '^{commit}'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim()
  } catch {
    throw new Error('revision is not available in repository: ' + revision)
  }
}

function treeEntries(root) {
  const entries = []
  function walk(dir, prefix = '') {
    for (const name of readdirSync(dir).sort()) {
      const absolute = join(dir, name)
      const path = prefix === '' ? name : prefix + '/' + name
      const stat = lstatSync(absolute)
      if (stat.isDirectory()) {
        walk(absolute, path)
      } else if (stat.isSymbolicLink()) {
        entries.push({ path, type: 'symlink', mode: stat.mode & 0o777, sha256: sha256(readlinkSync(absolute)) })
      } else if (stat.isFile()) {
        entries.push({ path, type: 'file', mode: stat.mode & 0o777, sha256: sha256(readFileSync(absolute)) })
      }
    }
  }
  walk(root)
  return entries
}

function treeState(root) {
  const entries = treeEntries(root)
  return { entries, sha256: sha256(JSON.stringify(entries)) }
}

function treeChanges(before, after) {
  const left = new Map(before.entries.map((entry) => [entry.path, entry]))
  const right = new Map(after.entries.map((entry) => [entry.path, entry]))
  const added = [...right.keys()].filter((path) => !left.has(path)).sort()
  const removed = [...left.keys()].filter((path) => !right.has(path)).sort()
  const modified = [...left.keys()].filter((path) => right.has(path) && JSON.stringify(left.get(path)) !== JSON.stringify(right.get(path))).sort()
  return { added, modified, removed }
}

function exportRevision(repository, revision, destination, archive) {
  execFileSync('git', ['-C', repository, 'archive', '--format=tar', '-o', archive, revision], { stdio: ['ignore', 'ignore', 'pipe'] })
  mkdirSync(destination)
  execFileSync('tar', ['-xf', archive, '-C', destination], { stdio: ['ignore', 'ignore', 'pipe'] })
  rmSync(archive)
}

export async function runCommandReview(repositoryPath, revision, command, outPath, options = {}) {
  const repository = resolve(repositoryPath)
  const out = resolve(outPath)
  if (!existsSync(repository) || !lstatSync(repository).isDirectory()) throw new Error('repository directory does not exist')
  if (inside(out, repository)) throw new Error('review receipt output must be outside the source repository')
  if (existsSync(out) && options.force !== true) throw new Error('review receipt already exists; choose another path or pass --force')
  if (typeof command !== 'string' || command.length === 0 || command.includes('\n')) throw new Error('--command must be a non-empty single line')
  if (/[*?[\]]/.test(command)) throw new Error('--command must not contain wildcard arguments')
  if (EXTERNAL_SIGNAL.test(command) && options.allowExternal !== true) throw new Error('command has an external-service signal; pass --allow-external only with explicit authority')
  const resolvedRevision = revisionAt(repository, revision)
  if (resolvedRevision !== revision) throw new Error('revision did not resolve to the exact requested commit')

  const temporary = mkdtempSync(join(tmpdir(), 'coding-harness-command-review-'))
  const runRoot = join(temporary, 'work')
  const archive = join(temporary, 'source.tar')
  let receipt
  try {
    exportRevision(repository, revision, runRoot, archive)
    const before = treeState(runRoot)
    const startedAt = new Date().toISOString()
    installForwarding()
    let result
    try {
      result = await runCommand(runRoot, command, options.timeoutMs ?? 300000)
      if (typeof options.onOutput === 'function') options.onOutput(result)
    } finally {
      removeForwarding()
      terminateAll('SIGKILL')
    }
    const finishedAt = new Date().toISOString()
    const after = treeState(runRoot)
    const changes = treeChanges(before, after)
    const mutated = changes.added.length + changes.modified.length + changes.removed.length > 0
    const ok = result.code === 0 && !result.timedOut
    receipt = {
      schema_version: 'coding-harness.command-review/v1',
      repository: { path: repository, revision },
      command,
      started_at: startedAt,
      finished_at: finishedAt,
      isolation: { mode: 'git-archive', temporary_directory_removed: false },
      result: {
        ok,
        exit_code: result.code,
        signal: result.signal,
        timed_out: result.timedOut,
        duration_ms: result.ms,
        stdout: streamReceipt(result.stdout),
        stderr: streamReceipt(result.stderr),
      },
      filesystem: {
        scope: 'isolated-tree-only',
        before_sha256: before.sha256,
        after_sha256: after.sha256,
        ...changes,
      },
      observability: {
        filesystem: 'compared',
        network: 'not-observed',
        child_processes: 'not-observed',
        outside_tree_writes: 'not-observed',
        external_execution_allowed: options.allowExternal === true,
      },
      status: mutated ? 'mutated' : ok ? 'passed' : 'failed',
      authorizes_verification: false,
    }
  } finally {
    rmSync(temporary, { recursive: true, force: true })
  }
  receipt.isolation.temporary_directory_removed = !existsSync(temporary)
  writeAtomic(out, JSON.stringify(receipt, null, 2) + '\n')
  return receipt
}

function stringArray(issues, value, where) {
  if (!Array.isArray(value)) { issues.push(where + ': required array'); return }
  value.forEach((entry, index) => requiredString(issues, entry, where + '[' + index + ']'))
}

function validateStream(issues, value, where) {
  if (!object(value)) { issues.push(where + ': required object'); return }
  rejectUnknown(issues, value, COMMAND_REVIEW_STREAM_KEYS, where)
  if (!Number.isInteger(value.bytes) || value.bytes < 0) issues.push(where + '.bytes: required integer >= 0')
  if (typeof value.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(value.sha256)) issues.push(where + '.sha256: required SHA-256')
}

export function validateCommandReview(receipt) {
  const issues = []
  if (!object(receipt)) return ['root: required object']
  rejectUnknown(issues, receipt, COMMAND_REVIEW_KEYS, 'root')
  if (receipt.schema_version !== 'coding-harness.command-review/v1') issues.push('schema_version: must be coding-harness.command-review/v1')
  requiredString(issues, receipt.command, 'command')
  if (typeof receipt.command === 'string' && receipt.command.includes('\n')) issues.push('command: required single line')
  for (const key of ['started_at', 'finished_at']) if (!Number.isFinite(Date.parse(receipt[key]))) issues.push(key + ': required timestamp')
  if (Number.isFinite(Date.parse(receipt.started_at)) && Number.isFinite(Date.parse(receipt.finished_at)) && Date.parse(receipt.finished_at) < Date.parse(receipt.started_at)) issues.push('finished_at: cannot precede started_at')

  if (!object(receipt.repository)) issues.push('repository: required object')
  else {
    rejectUnknown(issues, receipt.repository, COMMAND_REVIEW_REPOSITORY_KEYS, 'repository')
    requiredString(issues, receipt.repository.path, 'repository.path')
    requiredString(issues, receipt.repository.revision, 'repository.revision')
    if (typeof receipt.repository.revision === 'string' && !/^[0-9a-f]{40}$/.test(receipt.repository.revision)) issues.push('repository.revision: required full Git commit')
  }
  if (!object(receipt.isolation)) issues.push('isolation: required object')
  else {
    rejectUnknown(issues, receipt.isolation, COMMAND_REVIEW_ISOLATION_KEYS, 'isolation')
    if (receipt.isolation.mode !== 'git-archive') issues.push('isolation.mode: must be git-archive')
    if (receipt.isolation.temporary_directory_removed !== true) issues.push('isolation.temporary_directory_removed: must be true')
  }
  if (!object(receipt.result)) issues.push('result: required object')
  else {
    rejectUnknown(issues, receipt.result, COMMAND_REVIEW_RESULT_KEYS, 'result')
    for (const key of ['ok', 'timed_out']) if (typeof receipt.result[key] !== 'boolean') issues.push('result.' + key + ': required boolean')
    for (const key of ['exit_code', 'duration_ms']) if (!Number.isInteger(receipt.result[key]) || receipt.result[key] < 0) issues.push('result.' + key + ': required integer >= 0')
    if (receipt.result.signal !== null && typeof receipt.result.signal !== 'string') issues.push('result.signal: required string or null')
    validateStream(issues, receipt.result.stdout, 'result.stdout')
    validateStream(issues, receipt.result.stderr, 'result.stderr')
    if (receipt.result.ok === true && (receipt.result.exit_code !== 0 || receipt.result.timed_out === true)) issues.push('result: ok requires exit zero without timeout')
  }
  if (!object(receipt.filesystem)) issues.push('filesystem: required object')
  else {
    rejectUnknown(issues, receipt.filesystem, COMMAND_REVIEW_FILESYSTEM_KEYS, 'filesystem')
    if (receipt.filesystem.scope !== 'isolated-tree-only') issues.push('filesystem.scope: must be isolated-tree-only')
    for (const key of ['before_sha256', 'after_sha256']) if (typeof receipt.filesystem[key] !== 'string' || !/^[0-9a-f]{64}$/.test(receipt.filesystem[key])) issues.push('filesystem.' + key + ': required SHA-256')
    for (const key of ['added', 'modified', 'removed']) stringArray(issues, receipt.filesystem[key], 'filesystem.' + key)
  }
  if (!object(receipt.observability)) issues.push('observability: required object')
  else {
    rejectUnknown(issues, receipt.observability, COMMAND_REVIEW_OBSERVABILITY_KEYS, 'observability')
    if (receipt.observability.filesystem !== 'compared') issues.push('observability.filesystem: must be compared')
    for (const key of ['network', 'child_processes', 'outside_tree_writes']) if (receipt.observability[key] !== 'not-observed') issues.push('observability.' + key + ': must be not-observed')
    if (typeof receipt.observability.external_execution_allowed !== 'boolean') issues.push('observability.external_execution_allowed: required boolean')
  }
  if (!['passed', 'failed', 'mutated'].includes(receipt.status)) issues.push('status: must be passed, failed, or mutated')
  const changes = object(receipt.filesystem)
    ? ['added', 'modified', 'removed'].flatMap((key) => Array.isArray(receipt.filesystem[key]) ? receipt.filesystem[key] : [])
    : []
  if (receipt.status === 'passed' && (receipt.result?.ok !== true || changes.length > 0)) issues.push('status: passed requires a successful command and unchanged isolated tree')
  if (receipt.status === 'failed' && receipt.result?.ok === true) issues.push('status: failed requires a failed command')
  if (receipt.status === 'mutated' && changes.length === 0) issues.push('status: mutated requires an isolated-tree change')
  if (changes.length > 0 && receipt.status !== 'mutated') issues.push('status: isolated-tree changes require mutated')
  if (object(receipt.filesystem) && changes.length === 0 && receipt.filesystem.before_sha256 !== receipt.filesystem.after_sha256) issues.push('filesystem: unchanged paths require matching tree hashes')
  if (object(receipt.filesystem) && changes.length > 0 && receipt.filesystem.before_sha256 === receipt.filesystem.after_sha256) issues.push('filesystem: changed paths require different tree hashes')
  if (receipt.authorizes_verification !== false) issues.push('authorizes_verification: must be false')
  return issues
}

export function checkCommandReview(repositoryPath, revision, command, receiptPath) {
  const repository = resolve(repositoryPath)
  const receipt = JSON.parse(readFileSync(resolve(receiptPath), 'utf8'))
  const problems = validateCommandReview(receipt)
  let availableRevision = null
  try { availableRevision = revisionAt(repository, revision) } catch (error) { problems.push(error.message) }
  if (receipt?.repository?.path !== repository) problems.push('repository path does not match receipt')
  if (receipt?.repository?.revision !== revision || availableRevision !== revision) problems.push('repository revision does not match receipt')
  if (receipt?.command !== command) problems.push('command does not match receipt')
  return {
    schema_version: 'coding-harness.command-review-check/v1',
    receipt: resolve(receiptPath),
    valid: problems.length === 0,
    passed_without_tree_changes: problems.length === 0 && receipt.status === 'passed',
    authorizes_verification: false,
    problems,
  }
}
