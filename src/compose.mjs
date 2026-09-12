import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Compose declared sources into one text, in declaration order.
 *
 * Each source is trimmed of trailing whitespace and joined by one blank line,
 * so composition is independent of a source file's final newline.
 *
 * @param {string} root - Directory the source paths resolve against.
 * @param {string[]} sources - Repository-relative source paths.
 * @returns {string} The composed text, ending in one newline.
 */
export function composeText(root, sources) {
  const parts = sources.map((source) => readFileSync(resolve(root, source), 'utf8').replace(/\s+$/u, ''))
  return `${parts.join('\n\n')}\n`
}

/**
 * Hash composed text for the lock record.
 *
 * @param {string} text - Composed text.
 * @returns {string} Lowercase hex SHA-256.
 */
export function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}
