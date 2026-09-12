import { readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { loadManifest, validateManifest } from './manifest.mjs'
import { inspect } from './state.mjs'

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

/**
 * Inspect every manifest under a root.
 *
 * @param {string} root - Directory to scan.
 * @returns {{ path: string, status: string, detail: string }[]}
 */
export function scan(root) {
  return findManifests(root).map((manifestPath) => {
    const path = relative(root, manifestPath)
    let manifest
    try {
      manifest = loadManifest(manifestPath)
    } catch (error) {
      return { path, status: 'error', detail: error.message }
    }
    const errors = validateManifest(manifest)
    if (errors.length > 0) return { path, status: 'error', detail: errors[0] }
    const result = inspect(dirname(manifestPath), manifest)
    return { path, status: result.status, detail: result.detail }
  })
}
