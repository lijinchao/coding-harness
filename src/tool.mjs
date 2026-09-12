import { execFileSync } from 'node:child_process'
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
 * @returns {string} The version from this package's package.json.
 */
export function toolVersion() {
  return JSON.parse(readFileSync(resolve(toolRoot(), 'package.json'), 'utf8')).version
}

/**
 * The git commit of the running tool's checkout, when it is one.
 *
 * Consumers pin this so a moved tag or branch is detected before trust.
 *
 * @returns {string|undefined}
 */
export function toolCommit() {
  try {
    return execFileSync('git', ['-C', toolRoot(), 'rev-parse', 'HEAD'], { stdio: 'pipe' }).toString().trim()
  } catch {
    return undefined
  }
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * SHA-256 of every tool source file, keyed by repository-relative path.
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
