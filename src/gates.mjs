import { execSync } from 'node:child_process'

/**
 * Run one shell command in a directory.
 *
 * @param {string} root - Directory to run in.
 * @param {string} command - Command line.
 * @returns {number} The exit code.
 */
export function runCommand(root, command) {
  try {
    execSync(command, { cwd: root, stdio: 'inherit' })
    return 0
  } catch (error) {
    return typeof error.status === 'number' ? error.status : 1
  }
}

/**
 * Run every gate in a manifest and report the outcome.
 *
 * One declared list drives local runs and CI, so the two cannot drift. A
 * blocking failure makes the caller exit non-zero; an advisory failure is a
 * warning only.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object[]} gates - Gate entries.
 * @returns {{ id: string, severity: string, code: number, ok: boolean }[]}
 */
export function runGates(root, gates) {
  return gates.map((gate) => {
    const code = runCommand(root, gate.command)
    return { id: gate.id, severity: gate.severity, code, ok: code === 0 }
  })
}
