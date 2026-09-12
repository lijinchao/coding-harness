import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

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
  return JSON.parse(readFileSync(resolve(here, '..', 'package.json'), 'utf8')).version
}
