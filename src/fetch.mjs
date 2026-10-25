import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { basename, dirname, isAbsolute, resolve } from 'node:path'

/** A manual Git worktree may borrow only its own main checkout's cache. */
export function sharedCacheRoot(root, cache = '.harness') {
  if (isAbsolute(cache)) return undefined
  try {
    const common = execFileSync('git', ['-C', root, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', stdio: 'pipe' }).trim()
    if (basename(common) !== '.git') return undefined
    const shared = resolve(dirname(common), cache)
    return shared === resolve(root, cache) ? undefined : shared
  } catch { return undefined }
}

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
export function ensureGitCheckout(source, version, cacheRoot, tag = 'v' + version, fallbackCacheRoot) {
  const url = gitUrl(source)
  const repoDir = resolve(cacheRoot, cacheKey(source, version, tag), 'repo')
  if (existsSync(resolve(repoDir, '.git'))) return repoDir
  if (fallbackCacheRoot !== undefined) {
    const shared = resolve(fallbackCacheRoot, cacheKey(source, version, tag), 'repo')
    if (existsSync(resolve(shared, '.git'))) return shared
  }
  if (process.env.HARNESS_OFFLINE === '1') throw new Error('offline cache miss for ' + tag + ' at ' + repoDir + '; populate the pinned dependency online first')
  mkdirSync(dirname(repoDir), { recursive: true })
  try {
    execFileSync('git', ['-c', 'http.lowSpeedLimit=1024', '-c', 'http.lowSpeedTime=15', 'clone', '--depth', '1', '--branch', tag, '--no-tags', url, repoDir], { stdio: 'pipe', timeout: 30000, killSignal: 'SIGKILL' })
  } catch (error) {
    const detail = error.stderr === undefined ? error.message : error.stderr.toString().trim()
    throw new Error('could not fetch ' + url + ' at ' + tag + ': ' + detail)
  }
  return repoDir
}
