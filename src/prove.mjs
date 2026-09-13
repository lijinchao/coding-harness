import { execFileSync } from 'node:child_process'
import { runCommand } from './process.mjs'

/**
 * Working-tree changes git can see, or null when this is not a git checkout.
 */
function dirtyPaths(root) {
  try {
    return execFileSync('git', ['-C', root, 'status', '--porcelain'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
      .split('\n')
      .filter(Boolean)
  } catch {
    return null
  }
}

/**
 * Run the three-step proof for one gate.
 *
 * The proof is transactional: it refuses to start unless the working tree is
 * clean, and it refuses to report success unless the tree is clean again after
 * the revert. A blocking gate must declare both a prove_fires_command and a
 * revert_command; there is no destructive default revert. A gate whose action
 * no longer fires is an error, not a silent pass.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object} gate - A validated gate.
 * @param {number} [timeoutMs] - Per-command timeout; zero means none.
 * @returns {Promise<{ status: string, detail: string }>}
 */
export async function proveGate(root, gate, timeoutMs = 0) {
  if (gate.prove_fires_command === undefined) {
    return gate.severity === 'blocking'
      ? { status: 'error', detail: 'blocking gate has no prove_fires_command' }
      : { status: 'skip', detail: 'no prove_fires_command' }
  }
  if (gate.revert_command === undefined) return { status: 'error', detail: 'no revert_command; refusing to guess a revert' }
  const before = dirtyPaths(root)
  if (before === null) return { status: 'error', detail: 'not a git working tree; refusing to prove because the revert cannot be verified' }
  if (before.length > 0) return { status: 'error', detail: 'working tree has ' + before.length + ' uncommitted path(s) (' + before.slice(0, 3).join(', ') + '); commit or stash before prove' }
  const introduced = await runCommand(root, gate.prove_fires_command, timeoutMs)
  if (introduced.code !== 0) return { status: 'error', detail: 'introducing the failure exited ' + introduced.code + (introduced.timedOut ? ' (timeout)' : '') }
  const fired = await runCommand(root, gate.command, timeoutMs)
  if (fired.code === 0) {
    await runCommand(root, gate.revert_command, timeoutMs)
    const dirty = dirtyPaths(root)
    if (dirty === null || dirty.length > 0) return { status: 'error', detail: 'the proof left the working tree dirty' + (dirty === null ? '' : ': ' + dirty.slice(0, 3).join(', ')) }
    return { status: 'dead', detail: 'gate did not fire on the introduced failure' }
  }
  const reverted = await runCommand(root, gate.revert_command, timeoutMs)
  if (reverted.code !== 0) return { status: 'error', detail: 'revert exited ' + reverted.code + (reverted.timedOut ? ' (timeout)' : '') }
  const after = dirtyPaths(root)
  if (after === null || after.length > 0) return { status: 'error', detail: 'the proof left the working tree dirty' + (after === null ? '' : ': ' + after.slice(0, 3).join(', ')) }
  const clean = await runCommand(root, gate.command, timeoutMs)
  if (clean.code !== 0) return { status: 'error', detail: 'gate still fails after revert' }
  return { status: 'ok', detail: 'fired on the failure and passed after revert' }
}
