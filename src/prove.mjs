import { execSync } from 'node:child_process'

function run(root, command) {
  try {
    execSync(command, { cwd: root, stdio: 'pipe' })
    return 0
  } catch (error) {
    return typeof error.status === 'number' ? error.status : 1
  }
}

/**
 * Run the three-step proof for one gate.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object} gate - A gate entry.
 * @returns {{ status: string, detail: string }}
 */
export function proveGate(root, gate) {
  if (gate.prove_fires_command === undefined) return { status: 'skip', detail: 'no prove_fires_command' }
  const revert = gate.revert_command ?? 'git checkout -- .'
  const introduced = run(root, gate.prove_fires_command)
  if (introduced !== 0) return { status: 'error', detail: 'introducing the failure exited ' + introduced }
  const fired = run(root, gate.command)
  if (fired === 0) {
    run(root, revert)
    return { status: 'dead', detail: 'gate did not fire on the introduced failure' }
  }
  const reverted = run(root, revert)
  if (reverted !== 0) return { status: 'error', detail: 'revert exited ' + reverted }
  const clean = run(root, gate.command)
  if (clean !== 0) return { status: 'error', detail: 'gate still fails after revert' }
  return { status: 'ok', detail: 'fired on the failure and passed after revert' }
}
