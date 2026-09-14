import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

/**
 * True when a base source is a git URL rather than a local release directory.
 *
 * @param {string} source - A declared base source.
 * @returns {boolean}
 */
export function isGitSource(source) {
  return typeof source === 'string' && source.startsWith('git:')
}

/**
 * The URL part of a git base source.
 *
 * @param {string} source - A base source prefixed `git:`.
 * @returns {string}
 */
export function gitUrl(source) {
  return source.slice('git:'.length)
}

function cacheKey(source, version, tag) {
  const suffix = tag === 'v' + version ? '' : '#' + tag
  return createHash('sha256').update(source + '@' + version + suffix).digest('hex').slice(0, 16)
}

/**
 * Ensure a shallow checkout of the tagged base release exists under the cache.
 *
 * A released version is immutable, so a populated cache is reused; delete it to
 * re-fetch a moved tag.
 *
 * @param {string} source - A base source prefixed `git:`.
 * @param {string} version - Pinned base version.
 * @param {string} cacheRoot - Directory that holds the checkout cache.
 * @param {string} [tag] - The tag to fetch; `v<version>` by default. A pack uses its own convention, because one repository holds many artifacts and its tags name its own releases.
 * @returns {string} The checkout root.
 */
export function ensureGitCheckout(source, version, cacheRoot, tag = 'v' + version) {
  const url = gitUrl(source)
  const repoDir = resolve(cacheRoot, cacheKey(source, version, tag), 'repo')
  if (existsSync(resolve(repoDir, '.git'))) return repoDir
  mkdirSync(dirname(repoDir), { recursive: true })
  try {
    execFileSync('git', ['clone', '--depth', '1', '--branch', tag, '--no-tags', url, repoDir], { stdio: 'pipe' })
  } catch (error) {
    const detail = error.stderr === undefined ? error.message : error.stderr.toString().trim()
    throw new Error('could not fetch ' + url + ' at ' + tag + ': ' + detail)
  }
  return repoDir
}
