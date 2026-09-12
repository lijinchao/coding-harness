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
    if (rel.endsWith('.md')) problems.push(...linkProblems(root, rel, text))
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
