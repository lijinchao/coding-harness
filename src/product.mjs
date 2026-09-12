import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Read the product version from its declared source.
 *
 * Without a pattern the whole file must be one version: a version file that
 * also carries prose is a second home for a fact that has one.
 *
 * @param {string} path - Absolute path of the version source.
 * @param {string} [pattern] - Regular expression; the first capture group is the version.
 * @returns {{ version?: string, problem?: string }}
 */
export function readProductVersion(path, pattern) {
  if (!existsSync(path)) return { problem: 'file not found' }
  const text = readFileSync(path, 'utf8')
  if (pattern === undefined) {
    const version = text.trim()
    if (version === '') return { problem: 'the file is empty' }
    if (/\s/.test(version)) return { problem: 'the whole file must be one version, or declare product.version.pattern' }
    return { version }
  }
  const match = new RegExp(pattern, 'm').exec(text)
  if (match === null) return { problem: 'pattern did not match' }
  const version = match[1] ?? match[0]
  if (version.trim() === '') return { problem: 'pattern matched an empty version' }
  return { version: version.trim() }
}

/**
 * Problems with the declared product version and the files that mention it.
 *
 * The product version has one source; every declared mention must agree with
 * it. This is deliberately separate from the base pin: the pin is a dependency
 * and lives only in the manifest.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {{ version: { path: string, pattern?: string }, mentions?: string[] }} product
 * @returns {string[]}
 */
export function productProblems(root, product) {
  const problems = []
  const source = resolve(root, product.version.path)
  const { version, problem } = readProductVersion(source, product.version.pattern)
  if (problem !== undefined) return ['product.version.path (' + product.version.path + '): ' + problem]
  for (const rel of product.mentions ?? []) {
    const file = resolve(root, rel)
    if (!existsSync(file)) { problems.push(rel + ': mentioned file not found'); continue }
    if (!readFileSync(file, 'utf8').includes(version)) problems.push(rel + ': does not mention the product version ' + version)
  }
  return problems
}
