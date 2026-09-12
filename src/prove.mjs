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
 * A blocking gate must declare both a prove_fires_command and a revert_command;
 * there is no destructive default revert. A gate whose action no longer fires
 * is an error, not a silent pass.
 *
 * @returns {{ status: string, detail: string }}
 */
export function proveGate(root, gate) {
  if (gate.prove_fires_command === undefined) {
    return gate.severity === 'blocking'
      ? { status: 'error', detail: 'blocking gate has no prove_fires_command' }
      : { status: 'skip', detail: 'no prove_fires_command' }
  }
  if (gate.revert_command === undefined) return { status: 'error', detail: 'no revert_command; refusing to guess a revert' }
  const introduced = run(root, gate.prove_fires_command)
  if (introduced !== 0) return { status: 'error', detail: 'introducing the failure exited ' + introduced }
  const fired = run(root, gate.command)
  if (fired === 0) {
    run(root, gate.revert_command)
    return { status: 'dead', detail: 'gate did not fire on the introduced failure' }
  }
  const reverted = run(root, gate.revert_command)
  if (reverted !== 0) return { status: 'error', detail: 'revert exited ' + reverted }
  const clean = run(root, gate.command)
  if (clean !== 0) return { status: 'error', detail: 'gate still fails after revert' }
  return { status: 'ok', detail: 'fired on the failure and passed after revert' }
}
