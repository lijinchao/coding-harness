import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { basename, dirname, extname, relative, resolve, sep } from 'node:path'

const IGNORED_DIRECTORIES = new Set([
  '.codegraph', '.git', '.harness', '.next', '.tmp-registry', '.venv', '.wiscode', 'build', 'coverage', 'dist',
  'node_modules', 'output', 'outputs', 'target', 'venv', '__pycache__',
])

const SAFE_SCRIPT_NAMES = new Set(['check', 'lint', 'test', 'typecheck', 'verify'])
const EXTERNAL_SIGNAL = /\b(curl|docker|http|https|kubectl|llm|mcp|mongo|mysql|oauth|openai|postgres|provider|redis|requests|socket|urllib|uvicorn)\b/i
const HIGH_IMPACT_SIGNAL = /\b(delete|deploy|drop|migrat(?:e|ion)|npm publish|production|push|release|remove|rm)\b/i

function git(root, args, options = {}) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
  } catch {
    return null
  }
}

function repositoryRoot(dir) {
  const root = git(resolve(dir), ['rev-parse', '--show-toplevel'])
  if (root === null) throw new Error('survey requires a git working tree: ' + resolve(dir))
  return root.trim()
}

function toRelative(root, path) {
  return relative(root, path).split(sep).join('/')
}

function filesUnder(root, limit = 20000) {
  const files = []
  const pending = [root]
  while (pending.length > 0 && files.length < limit) {
    const current = pending.pop()
    let entries
    try {
      entries = readdirSync(current, { withFileTypes: true })
    } catch {
      continue
    }
    entries.sort((a, b) => b.name.localeCompare(a.name))
    for (const entry of entries) {
      if (files.length >= limit) break
      const path = resolve(current, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORIES.has(entry.name)) pending.push(path)
      } else if (entry.isFile()) {
        files.push(toRelative(root, path))
      }
    }
  }
  return files.sort()
}

function workingTree(root) {
  const raw = git(root, ['status', '--porcelain=v1', '-z']) ?? ''
  const records = raw.split('\0').filter(Boolean)
  const paths = []
  const entries = []
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index]
    const status = record.slice(0, 2)
    const path = record.slice(3)
    entries.push({ status, path })
    paths.push(path)
    if (status.includes('R') || status.includes('C')) index += 1
  }
  return {
    clean: entries.length === 0,
    count: entries.length,
    tracked_count: entries.filter((entry) => entry.status !== '??').length,
    untracked_count: entries.filter((entry) => entry.status === '??').length,
    top_level_paths: [...new Set(paths.map((path) => path.split('/')[0]))].sort(),
  }
}

function worktrees(root) {
  const output = git(root, ['worktree', 'list', '--porcelain']) ?? ''
  return output.trim().split('\n\n').filter(Boolean).map((record) => {
    const fields = Object.fromEntries(record.split('\n').map((line) => {
      const space = line.indexOf(' ')
      return space === -1 ? [line, true] : [line.slice(0, space), line.slice(space + 1)]
    }))
    return {
      path: fields.worktree,
      head: fields.HEAD,
      branch: typeof fields.branch === 'string' ? fields.branch.replace('refs/heads/', '') : null,
      detached: fields.detached === true,
    }
  })
}

function contextInventory(files) {
  const categories = {
    architecture: [],
    contracts: [],
    decisions: [],
    evaluations: [],
    runbooks: [],
    status: [],
    workflow: [],
  }
  for (const path of files) {
    const lower = path.toLowerCase()
    if (lower.includes('architecture') && lower.endsWith('.md')) categories.architecture.push(path)
    if (/(^|\/)docs\/contracts\//.test(lower)) categories.contracts.push(path)
    if (/(^|\/)docs\/decisions\//.test(lower)) categories.decisions.push(path)
    if (/(^|\/)docs\/evals?\//.test(lower)) categories.evaluations.push(path)
    if (/(^|\/)docs\/runbooks?\//.test(lower)) categories.runbooks.push(path)
    if (/(current-status|status\.md|roadmap\.md|slices\.md)$/.test(lower)) categories.status.push(path)
    if (/(^|\/)(workflow|plans)\.md$/.test(lower)) categories.workflow.push(path)
  }
  return Object.fromEntries(Object.entries(categories).map(([name, paths]) => [name, {
    count: paths.length,
    paths: paths.slice(0, 50),
    truncated: paths.length > 50,
  }]))
}

function commandAvailable(root, executable) {
  if (executable.includes('/')) return existsSync(resolve(root, executable))
  try {
    execFileSync('sh', ['-c', 'command -v "$1" >/dev/null 2>&1', 'survey', executable], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function commandCandidate(root, candidate) {
  const commandMaterial = [candidate.command.join(' '), candidate.execution_material ?? ''].join('\n')
  const riskMaterial = [candidate.command.join(' '), candidate.material ?? ''].join('\n')
  const issues = []
  const riskSignals = []
  if (/[*?[\]]/.test(commandMaterial)) issues.push('wildcards-are-not-executable-command-arguments')
  if (!commandAvailable(root, candidate.command[0])) issues.push('executable-not-resolvable')
  if (EXTERNAL_SIGNAL.test(riskMaterial)) riskSignals.push('external-service')
  if (HIGH_IMPACT_SIGNAL.test(riskMaterial)) riskSignals.push('high-impact')
  // Discovery is evidence about what exists, not authorization to run it.
  // A repository owner promotes a reviewed candidate into the manifest.
  const safeDefault = false
  return {
    id: candidate.id,
    source: candidate.source,
    command: candidate.command,
    resolvable: issues.length === 0,
    issues,
    risk_signals: riskSignals,
    safe_default: safeDefault,
    review_required: !safeDefault,
  }
}

function packageCommands(root, files) {
  if (!files.includes('package.json')) return []
  try {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    if (pkg.scripts === null || typeof pkg.scripts !== 'object') return []
    return Object.entries(pkg.scripts).filter(([, value]) => typeof value === 'string').map(([name, material]) => ({
      id: 'package:' + name,
      kind: 'package-script',
      name,
      source: 'package.json',
      command: ['npm', 'run', name],
      material,
      execution_material: material,
    }))
  } catch {
    return []
  }
}

function makeCommands(root, files) {
  if (!files.includes('Makefile')) return []
  const text = readFileSync(resolve(root, 'Makefile'), 'utf8')
  return [...text.matchAll(/^([A-Za-z0-9_.-]+):(?:\s|$)/gm)]
    .map((match) => match[1])
    .filter((name) => SAFE_SCRIPT_NAMES.has(name))
    .map((name) => ({ id: 'make:' + name, kind: 'make-target', name, source: 'Makefile', command: ['make', name], material: '' }))
}

function scriptCommands(root, files) {
  return files.filter((path) => /^scripts\/[^/]*(?:gate|test)[^/]*\.(?:js|mjs|py|sh)$/.test(path)).map((path) => {
    const extension = path.split('.').pop()
    const executable = extension === 'py' ? 'python' : extension === 'sh' ? 'sh' : 'node'
    let material = ''
    try { material = readFileSync(resolve(root, path), 'utf8').slice(0, 65536) } catch { /* classification remains conservative */ }
    return { id: 'script:' + path, kind: 'script', name: basename(path), source: path, command: [executable, path], material }
  })
}

function ciFiles(files) {
  return files.filter((path) => path === '.gitlab-ci.yml'
    || path === '.gitlab-ci.yaml'
    || /^\.github\/workflows\/.*\.ya?ml$/.test(path)
    || /^\.circleci\/config\.ya?ml$/.test(path))
}

function codeownerFiles(files) {
  return files.filter((path) => path === 'CODEOWNERS'
    || path === '.github/CODEOWNERS'
    || path === 'docs/CODEOWNERS')
}

function referencedRepositories(root, files) {
  const sourceFiles = files.filter((path) => /(^|\/)(AGENTS|ARCHITECTURE|README|WORKFLOW|current-status|project-map)\.md$/i.test(path))
  const repositories = new Map()
  const missing = new Map()
  for (const source of sourceFiles) {
    let text
    try { text = readFileSync(resolve(root, source), 'utf8') } catch { continue }
    for (const match of text.matchAll(/\/(?:Users|private|var|tmp)\/[^\s`"'<>()[\]{}]+/g)) {
      const path = match[0].replace(/[.,;:)]+$/, '')
      let probe = path
      while (!existsSync(probe) && dirname(probe) !== probe) probe = dirname(probe)
      const candidate = existsSync(path) && !lstatSync(path).isDirectory() ? dirname(path) : probe
      const repository = git(candidate, ['rev-parse', '--show-toplevel'])?.trim()
      if (repository && repository !== root) {
        const entry = repositories.get(repository) ?? { path: repository, exists: true, sources: new Set(), missing_references: new Set() }
        entry.sources.add(source)
        if (!existsSync(path)) entry.missing_references.add(path)
        repositories.set(repository, entry)
      } else if (!existsSync(path) && extname(path) === '') {
        const entry = missing.get(path) ?? { path, exists: false, sources: new Set() }
        entry.sources.add(source)
        missing.set(path, entry)
      }
    }
  }
  return [...repositories.values(), ...missing.values()]
    .map((entry) => ({
      ...entry,
      sources: [...entry.sources].sort(),
      ...(entry.missing_references === undefined ? {} : { missing_references: [...entry.missing_references].sort() }),
    }))
    .sort((a, b) => a.path.localeCompare(b.path))
    .slice(0, 100)
}

export function surveyRepository(dir) {
  const root = repositoryRoot(dir)
  const files = filesUnder(root)
  const manifestPath = 'harness.manifest.json'
  const hasManifest = files.includes(manifestPath)
  const commands = [
    ...packageCommands(root, files),
    ...makeCommands(root, files),
    ...scriptCommands(root, files),
  ].map((candidate) => commandCandidate(root, candidate)).sort((a, b) => a.id.localeCompare(b.id))
  const entrypoints = files.filter((path) => /(^|\/)(AGENTS(?:\.delta)?|CLAUDE|REVIEW)\.md$/.test(path))
  const tree = workingTree(root)
  return {
    schema_version: 'coding-harness.survey/v1',
    repository: {
      root,
      head: git(root, ['rev-parse', 'HEAD'])?.trim() ?? null,
      branch: git(root, ['branch', '--show-current'])?.trim() || null,
      working_tree: tree,
      worktrees: worktrees(root),
    },
    integration: {
      status: hasManifest ? 'adopted-unchecked' : 'not-adopted',
      manifest: hasManifest ? manifestPath : null,
      ready: false,
      next: hasManifest ? 'run harness check and harness doctor' : 'review survey candidates before harness init',
    },
    agent_entrypoints: entrypoints,
    context: contextInventory(files),
    governance: {
      ci: ciFiles(files),
      codeowners: codeownerFiles(files),
    },
    verification: {
      candidate_count: commands.length,
      safe_default_count: commands.filter((item) => item.safe_default).length,
      candidates: commands,
      executed: false,
    },
    external_repositories: referencedRepositories(root, files),
    qualification: {
      status: 'unavailable',
      reason: hasManifest
        ? 'survey does not execute or trust declared checks; run check, doctor, and gates'
        : 'project manifest is missing',
    },
  }
}
