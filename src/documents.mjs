import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { matchGlob } from './select.mjs'

const IGNORED_DIRS = new Set(['.git', 'node_modules', '.harness', 'dist', 'build', 'export'])
const INSTRUCTION_NAMES = new Set(['AGENTS.md', 'AGENTS.delta.md'])

/**
 * Slug a heading the way a Markdown anchor link expects.
 *
 * @param {string} heading - The heading text without its leading hashes.
 * @returns {string}
 */
export function headingSlug(heading) {
  return heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')
}

function stripFences(text) {
  return text.replace(/```[\s\S]*?```/g, '').replace(/~~~[\s\S]*?~~~/g, '')
}

function headingsOf(text) {
  const slugs = new Set()
  for (const line of text.split('\n')) {
    const match = line.match(/^#{1,6}\s+(.*)$/)
    if (match !== null) slugs.add(headingSlug(match[1]))
  }
  return slugs
}

/**
 * Problems with the links one Markdown document declares.
 *
 * External schemes are skipped. A relative target must exist, and a fragment
 * must name a heading in the target file (or in this file for a bare anchor).
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {string} rel - Document path, repository-relative.
 * @param {string} text - Document contents.
 * @returns {string[]}
 */
export function linkProblems(root, rel, text) {
  const problems = []
  const path = resolve(root, rel)
  const body = stripFences(text)
  const own = headingsOf(text)
  const pattern = /!?\[[^\]]*\]\(([^)\s]+)\)/g
  let match
  while ((match = pattern.exec(body)) !== null) {
    const target = match[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(target)) continue
    const [file, anchor = ''] = target.split('#')
    if (file === '') {
      if (anchor !== '' && !own.has(anchor)) problems.push(rel + ': anchor not found: #' + anchor)
      continue
    }
    const targetPath = resolve(dirname(path), decodeURIComponent(file))
    if (!existsSync(targetPath)) { problems.push(rel + ': link target not found: ' + file); continue }
    if (anchor !== '' && statSync(targetPath).isFile() && targetPath.endsWith('.md')) {
      if (!headingsOf(readFileSync(targetPath, 'utf8')).has(anchor)) problems.push(rel + ': anchor not found: ' + file + '#' + anchor)
    }
  }
  return problems
}

/**
 * Problems with the documents a manifest declares: missing files, budgets, links.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {{ path: string, maxWords?: number }[]} docs - Declared documents.
 * @returns {string[]}
 */
export function documentProblems(root, docs) {
  const problems = []
  for (let index = 0; index < docs.length; index += 1) {
    const entry = docs[index]
    const rel = entry.path
    const path = resolve(root, rel)
    if (!existsSync(path)) { problems.push('governance.docs[' + index + '] (' + rel + '): file not found'); continue }
    if (!statSync(path).isFile()) { problems.push('governance.docs[' + index + '] (' + rel + '): not a file'); continue }
    const text = readFileSync(path, 'utf8')
    if (entry.maxWords !== undefined) {
      const words = text.split(/\s+/).filter(Boolean).length
      if (words > entry.maxWords) problems.push(rel + ': ' + words + ' words exceeds the budget of ' + entry.maxWords)
    }
    if (entry.forbid !== undefined) {
      const allow = entry.allow ?? []
      for (const pattern of entry.forbid) {
        const hit = text.split('\n').some((line) => line.includes(pattern) && !allow.some((benign) => line.includes(benign)))
        if (hit) problems.push(rel + ': contains forbidden text: ' + pattern)
      }
    }
    if (rel.endsWith('.md')) problems.push(...linkProblems(root, rel, text))
  }
  return problems
}

/**
 * Paths no surface covers. A changed path with no surface is selected by no
 * gate, so the minimal-check path would silently skip it.
 *
 * @param {{ paths: string[] }[]} surfaces - Declared surfaces.
 * @param {string[]} paths - Repository-relative paths.
 * @returns {string[]}
 */
export function uncoveredPaths(surfaces, paths) {
  return paths.filter((file) => !surfaces.some((surface) => surface.paths.some((pattern) => matchGlob(file, pattern))))
}

/**
 * Tracked files no surface covers.
 *
 * Every committed file belongs to some surface, or the matrix is incomplete and
 * a change to it selects nothing. The check reads `git ls-files`, so ignored
 * and untracked files are out of scope; a repository that is not a git checkout
 * is skipped.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {{ paths: string[] }[]} surfaces - Declared surfaces.
 * @returns {string[]}
 */
export function surfaceCoverageProblems(root, surfaces) {
  let tracked
  try {
    tracked = execFileSync('git', ['-C', root, 'ls-files'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n').filter(Boolean)
  } catch {
    return []
  }
  const uncovered = uncoveredPaths(surfaces, tracked)
  if (uncovered.length === 0) return []
  const problems = uncovered.slice(0, 5).map((file) => file + ': no surface covers this tracked file')
  if (uncovered.length > 5) problems.push(uncovered.length - 5 + ' more tracked file(s) have no surface')
  return problems
}

const DECISION_STATUSES = new Set(['proposed', 'accepted', 'implemented', 'superseded', 'rejected'])

function sectionBody(text, title) {
  const lines = text.split('\n')
  const start = lines.findIndex((line) => line.trim() === '## ' + title)
  if (start === -1) return null
  const body = []
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) break
    body.push(lines[index])
  }
  return body
}

/**
 * Problems with a decision record's lifecycle.
 *
 * A record states where it stands — proposed, accepted, implemented, superseded,
 * or rejected — and a superseded record names its replacement, which must exist.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {string} rel - Decision record path, repository-relative.
 * @param {string} text - Record contents.
 * @returns {string[]}
 */
export function decisionProblems(root, rel, text) {
  const problems = []
  const body = sectionBody(text, 'Status')
  const line = text.match(/^status:\s*(\S+)/im)
  const raw = body !== null ? (body.find((item) => item.trim() !== '') ?? '') : (line === null ? undefined : line[1])
  const status = raw === undefined ? undefined : raw.trim().toLowerCase()
  if (status === undefined || status === '') return [rel + ': missing status (## Status or Status: <value>)']
  if (!DECISION_STATUSES.has(status)) {
    problems.push(rel + ': status must be one of ' + [...DECISION_STATUSES].join(', '))
    return problems
  }
  for (const label of ['superseded-by', 'supersedes']) {
    const match = text.match(new RegExp('^' + label + ':\\s*(\\S+)', 'im'))
    if (match !== null && !existsSync(resolve(root, dirname(rel), match[1]))) problems.push(rel + ': ' + label + ' target not found: ' + match[1])
  }
  if (status === 'superseded' && !/^superseded-by:\s*\S+/im.test(text)) problems.push(rel + ': a superseded record must declare Superseded-by: <path>')
  return problems
}

const POSTMORTEM_SECTIONS = ['Impact', 'Root cause', 'Response', 'Regression test', 'Action items']

/**
 * Problems with a postmortem record.
 *
 * An incident must leave a permanent check. Every `Regression: <gate id or
 * path>` line must resolve to a gate in the manifest or to a file that exists,
 * so the lesson cannot decay into prose.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {string} rel - Record path, repository-relative.
 * @param {string} text - Record contents.
 * @param {Set<string>} gateIds - Gate ids declared by the manifest.
 * @returns {string[]}
 */
export function postmortemProblems(root, rel, text, gateIds) {
  const problems = []
  for (const section of POSTMORTEM_SECTIONS) {
    if (!new RegExp('^## ' + section + '\\b', 'm').test(text)) problems.push(rel + ': missing section ## ' + section)
  }
  const regressions = [...text.matchAll(/^regression:\s*(\S+)\s*$/gim)].map((match) => match[1])
  if (regressions.length === 0) problems.push(rel + ': declares no regression; add Regression: <gate id or path>')
  for (const reference of regressions) {
    if (gateIds.has(reference)) continue
    if (existsSync(resolve(root, reference))) continue
    problems.push(rel + ': Regression target not found: ' + reference)
  }
  return problems
}

/**
 * Every instruction file an agent can read, repository-relative.
 *
 * @param {string} root - Repository root.
 * @param {string} [prefix] - Directory being walked, repository-relative.
 * @returns {string[]}
 */
export function discoverInstructionFiles(root, prefix = '') {
  const found = []
  for (const entry of readdirSync(resolve(root, prefix), { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : prefix + '/' + entry.name
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue
      found.push(...discoverInstructionFiles(root, rel))
    } else if (INSTRUCTION_NAMES.has(entry.name)) {
      found.push(rel)
    }
  }
  return found.sort()
}

/**
 * Problems with the declared instruction tree.
 *
 * Every declared pattern must match an instruction file, and every instruction
 * file must be matched by a pattern: an unmanaged nested AGENTS.md is a rule
 * nobody governs.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {string[]} instructions - Declared globs.
 * @returns {string[]}
 */
export function instructionProblems(root, instructions) {
  const problems = []
  const discovered = discoverInstructionFiles(root)
  for (let index = 0; index < instructions.length; index += 1) {
    const pattern = instructions[index]
    if (!discovered.some((rel) => matchGlob(rel, pattern))) problems.push('governance.instructions[' + index + '] (' + pattern + '): matches no instruction file')
  }
  for (const rel of discovered) {
    if (!instructions.some((pattern) => matchGlob(rel, pattern))) problems.push(rel + ': unmanaged instruction file; declare it under governance.instructions')
  }
  return problems
}
