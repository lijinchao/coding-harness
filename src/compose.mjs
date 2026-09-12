import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const BASE_PREFIX = 'base:'

/**
 * Resolve a declared source path.
 *
 * A source prefixed `base:` resolves inside the fetched base release; any other source
 * resolves against the consumer root.
 *
 * @param {string} root - Directory the repository-local sources resolve against.
 * @param {string|undefined} baseDir - Root of the fetched base release, when one is pinned.
 * @param {string} source - A declared source path.
 * @returns {string} An absolute path.
 */
export function resolveSource(root, baseDir, source) {
  if (source.startsWith(BASE_PREFIX)) {
    if (baseDir === undefined || baseDir === null) throw new Error(`source ${source} requires a pinned base release`)
    return resolve(baseDir, source.slice(BASE_PREFIX.length))
  }
  return resolve(root, source)
}

/**
 * Compose declared sources into one text, in declaration order.
 *
 * Each source is trimmed of trailing whitespace and joined by one blank line,
 * so composition is independent of a source file's final newline.
 *
 * @param {string} root - Directory the repository-local source paths resolve against.
 * @param {string[]} sources - Declared source paths, optionally `base:`-prefixed.
 * @param {string} [baseDir] - Root of the fetched base release.
 * @returns {string} The composed text, ending in one newline.
 */
export function composeText(root, sources, baseDir) {
  const parts = sources.map((source) => readFileSync(resolveSource(root, baseDir, source), 'utf8').replace(/\s+$/u, ''))
  return `${parts.join('\n\n')}\n`
}

/**
 * Hash text or bytes for a lock or release record.
 *
 * @param {string|Buffer} data - Content to hash.
 * @returns {string} Lowercase hex SHA-256.
 */
export function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}
