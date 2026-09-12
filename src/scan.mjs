import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { loadManifest, validateManifest } from './manifest.mjs'
import { composeText, sha256 } from './compose.mjs'
import { loadRelease, verifyRelease } from './release.mjs'
import { ensureGitCheckout, isGitSource } from './fetch.mjs'
import { toolVersion } from './tool.mjs'

const SKIP = new Set(['.git', 'node_modules', '.harness'])

/**
 * Every harness.manifest.json under a root, sorted.
 *
 * @param {string} root - Directory to walk.
 * @returns {string[]} Absolute manifest paths.
 */
export function findManifests(root) {
  const found = []
  const walk = (dir) => {
    let entries
    try { entries = readdirSync(dir) } catch { return }
    for (const name of entries.slice().sort()) {
      if (name === 'harness.manifest.json') { found.push(join(dir, name)); continue }
      if (SKIP.has(name)) continue
      const full = join(dir, name)
      let info
      try { info = statSync(full) } catch { continue }
      if (info.isDirectory()) walk(full)
    }
  }
  walk(root)
  return found
}

function resolveBaseDir(root, manifest) {
  if (manifest.base === undefined) return undefined
  const config = manifest.base
  if (isGitSource(config.source)) {
    const cacheRoot = resolve(root, config.cache ?? '.harness')
    const repoDir = ensureGitCheckout(config.source, manifest.version, cacheRoot)
    return resolve(repoDir, config.registry ?? 'dist')
  }
  return resolve(root, config.source)
}

/**
 * Classify one consumer: ok, stale, diverged, or error.
 *
 * @param {string} manifestPath - Absolute path to a harness.manifest.json.
 * @returns {{ status: string, detail: string }}
 */
export function inspect(manifestPath) {
  const root = dirname(manifestPath)
  let manifest
  try {
    manifest = loadManifest(manifestPath)
  } catch (error) {
    return { status: 'error', detail: error.message }
  }
  const errors = validateManifest(manifest)
  if (errors.length > 0) return { status: 'error', detail: errors[0] }
  const locked = manifest.lock
  if (locked === undefined || locked.version !== manifest.version) return { status: 'stale', detail: 'lock missing or pinned to another version' }
  if (manifest.tool !== undefined && locked.tool?.version !== toolVersion()) {
    return { status: 'stale', detail: 'tool ' + (locked.tool === undefined ? 'none' : locked.tool.version) + ' != running ' + toolVersion() }
  }
  let baseDir
  try {
    baseDir = resolveBaseDir(root, manifest)
    if (baseDir !== undefined) {
      const loaded = loadRelease(baseDir, manifest.version)
      baseDir = loaded.dir
      const problem = verifyRelease(loaded.dir, loaded.release)
      if (problem !== null) return { status: 'diverged', detail: problem }
      if (locked.base === undefined) return { status: 'stale', detail: 'lock has no base pin' }
      for (const [rel, hash] of Object.entries(loaded.release.files)) {
        if (locked.base.files?.[rel] !== hash) return { status: 'diverged', detail: 'base file ' + rel + ' differs from the lock' }
      }
    }
  } catch (error) {
    return { status: 'error', detail: error.message }
  }
  try {
    for (const composition of manifest.compositions) {
      const text = composeText(root, composition.sources, baseDir)
      const path = resolve(root, composition.output)
      if (!existsSync(path)) return { status: 'diverged', detail: composition.output + ': missing' }
      if (readFileSync(path, 'utf8') !== text) return { status: 'diverged', detail: composition.output + ': drift' }
      if (locked.outputs?.[composition.output] !== sha256(text)) return { status: 'diverged', detail: composition.output + ': lock hash mismatch' }
    }
  } catch (error) {
    return { status: 'error', detail: error.message }
  }
  return { status: 'ok', detail: manifest.compositions.length + ' composition(s) match ' + manifest.version }
}

/**
 * Inspect every manifest under a root.
 *
 * @param {string} root - Directory to scan.
 * @returns {{ path: string, status: string, detail: string }[]}
 */
export function scan(root) {
  return findManifests(root).map((manifestPath) => {
    const result = inspect(manifestPath)
    return { path: relative(root, manifestPath), status: result.status, detail: result.detail }
  })
}
