import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { sha256 } from './compose.mjs'

/**
 * List every file under a directory, as sorted release-relative POSIX paths.
 *
 * @param {string} root - Directory to walk.
 * @returns {string[]} Relative paths, sorted.
 */
export function collectFiles(root) {
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else files.push(relative(root, full).split(sep).join('/'))
    }
  }
  walk(root)
  return files
}

/**
 * Read the version a base directory declares in its VERSION file.
 *
 * @param {string} baseDir - Directory holding the base files.
 * @returns {string|undefined} The declared version, or undefined.
 */
export function declaredVersion(baseDir) {
  const file = resolve(baseDir, 'VERSION')
  return existsSync(file) ? readFileSync(file, 'utf8').trim() : undefined
}

/**
 * Build a versioned, hashed base release under a registry directory.
 *
 * The release carries `release.json`, a per-file SHA-256 map, so a consumer can
 * detect a base that no longer matches the version it pinned.
 *
 * @param {string} baseDir - Directory holding the base files.
 * @param {string} outDir - Release registry directory.
 * @param {string} version - Released base version.
 * @param {{ force?: boolean }} [options] - Force overwrite of an existing release.
 * @returns {{ dir: string, release: { name: string, version: string, files: Record<string, string> } }}
 */
export function createRelease(baseDir, outDir, version, options = {}) {
  const dir = resolve(outDir, `base@${version}`)
  if (existsSync(dir) && options.force !== true) {
    throw new Error(`base@${version} already exists at ${dir}; bump base/VERSION or pass --force`)
  }
  const files = collectFiles(baseDir)
  const hashes = {}
  rmSync(dir, { recursive: true, force: true })
  for (const rel of files) {
    const content = readFileSync(resolve(baseDir, rel))
    hashes[rel] = sha256(content)
    const target = resolve(dir, rel)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  const release = { name: 'base', version, files: hashes }
  writeFileSync(resolve(dir, 'release.json'), `${JSON.stringify(release, null, 2)}\n`)
  return { dir, release }
}

/**
 * Load a versioned base release from a registry directory.
 *
 * @param {string} sourceDir - Release registry directory.
 * @param {string} version - Pinned base version.
 * @returns {{ dir: string, release: { name: string, version: string, files: Record<string, string> } }}
 */
export function loadRelease(sourceDir, version) {
  const dir = resolve(sourceDir, `base@${version}`)
  const manifestPath = resolve(dir, 'release.json')
  if (!existsSync(manifestPath)) throw new Error(`base@${version} not found under ${sourceDir}; run harness release`)
  const release = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (release.version !== version) throw new Error(`base release version ${release.version} does not match pinned ${version}`)
  return { dir, release }
}

/**
 * Verify a fetched base release against its own release record.
 *
 * @param {string} dir - Release directory.
 * @param {{ files: Record<string, string> }} release - Release record.
 * @returns {string|null} A message when a file no longer matches, else null.
 */
export function verifyRelease(dir, release) {
  for (const [rel, hash] of Object.entries(release.files)) {
    if (sha256(readFileSync(resolve(dir, rel))) !== hash) return `base file ${rel}: content does not match release.json`
  }
  return null
}
