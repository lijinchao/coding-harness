import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { collectFiles } from './release.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/**
 * The root of the running tool's checkout.
 *
 * @returns {string}
 */
export function toolRoot() {
  return resolve(here, '..')
}

/**
 * The version of the tool that is running.
 *
 * Consumers pin this in `manifest.tool.version`; sync and check fail when the
 * running tool is a different version, so the program that verifies a base is as
 * reproducible as the base itself.
 *
 * @returns {string} The version from this package's package.json.
 */
export function toolVersion() {
  return JSON.parse(readFileSync(resolve(toolRoot(), 'package.json'), 'utf8')).version
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * SHA-256 of every tool source file, keyed by repository-relative path.
 *
 * Consumers record this map in the lock; check fails when the running tool no
 * longer matches it, so the program that verifies a base is pinned by content,
 * not only by a version string.
 *
 * @returns {Record<string, string>}
 */
export function toolFiles() {
  const root = toolRoot()
  const files = {}
  for (const dir of ['bin', 'src']) {
    for (const rel of collectFiles(resolve(root, dir))) files[dir + '/' + rel] = sha256File(resolve(root, dir, rel))
  }
  files['package.json'] = sha256File(resolve(root, 'package.json'))
  return files
}
