import { execFileSync } from 'node:child_process'
import { runCommand } from './process.mjs'
import { outputViolations } from './gates.mjs'

// Exit zero is not sufficient: a timeout handler can exit successfully while
// leaving the work incomplete. Every successful proof stage must finish normally.
function completionProblem(result) {
  if (result.timedOut) return 'timed out'
  if (result.signal !== null) return 'terminated by signal ' + result.signal
  if (result.code !== 0) return 'exited ' + result.code
  return null
}

/**
 * Working-tree changes git can see, or null when this is not a git checkout.
 *
 * @param {string} root - Repository root.
 * @param {{ untracked?: boolean }} [options] - Untracked files are listed by default.
 * @returns {string[]|null}
 */
export function dirtyPaths(root, options = {}) {
  const args = ['-C', root, 'status', '--porcelain']
  if (options.untracked === false) args.push('--untracked-files=no')
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
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
export async function proveGate(root, gate, timeoutMs = 0, options = {}) {
  if (gate.prove_fires_command === undefined) {
    return gate.severity === 'blocking'
      ? { status: 'error', detail: 'blocking gate has no prove_fires_command' }
      : { status: 'skip', detail: 'no prove_fires_command' }
  }
  if (gate.revert_command === undefined) return { status: 'error', detail: 'no revert_command; refusing to guess a revert' }
  const untracked = options.trackedOnly === true ? false : true
  const before = dirtyPaths(root, { untracked })
  if (before === null) return { status: 'error', detail: 'not a git working tree; refusing to prove because the revert cannot be verified' }
  if (before.length > 0) return { status: 'error', detail: 'working tree has ' + before.length + ' uncommitted path(s) (' + before.slice(0, 3).join(', ') + '); commit or stash before prove' }
  // Once the failure has been introduced, every path attempts the revert.
  const revert = async () => {
    const result = await runCommand(root, gate.revert_command, timeoutMs)
    const problem = completionProblem(result)
    if (problem !== null) return 'the revert ' + problem
    // A gate may need a product the repository cannot commit; the revert
    // restores the state, and the setup that produced the product runs again.
    if (gate.setup_command !== undefined) {
      const setup = await runCommand(root, gate.setup_command, timeoutMs)
      const problem = completionProblem(setup)
      if (problem !== null) return 'the setup ' + problem
    }
    const dirty = dirtyPaths(root, { untracked })
    if (dirty === null) return 'the revert could not be verified'
    if (dirty.length > 0) return 'the revert left the working tree dirty: ' + dirty.slice(0, 3).join(', ')
    return null
  }
  if (gate.setup_command !== undefined) {
    const setup = await runCommand(root, gate.setup_command, timeoutMs)
    const problem = completionProblem(setup)
    if (problem !== null) {
      return { status: 'error', detail: 'the setup ' + problem }
    }
  }
  const introduced = await runCommand(root, gate.prove_fires_command, timeoutMs)
  const introductionProblem = completionProblem(introduced)
  if (introductionProblem !== null) {
    const problem = await revert()
    return { status: 'error', detail: 'introducing the failure ' + introductionProblem + (problem === null ? ' (reverted)' : '; ' + problem) }
  }
  const fired = await runCommand(root, gate.command, timeoutMs)
  if (fired.timedOut || fired.signal !== null) {
    const problem = await revert()
    return { status: 'error', detail: (fired.timedOut ? 'gate timed out' : 'gate terminated by signal ' + fired.signal) + ' under injection; no proof recorded' + (problem === null ? ' (reverted)' : '; ' + problem) }
  }
  if (fired.code === 0 && outputViolations(fired.output, gate.expect).length === 0) {
    const problem = await revert()
    return problem === null
      ? { status: 'dead', detail: 'gate did not fire on the introduced failure' }
      : { status: 'error', detail: 'the gate did not fire and ' + problem }
  }
  const problem = await revert()
  if (problem !== null) return { status: 'error', detail: problem }
  const clean = await runCommand(root, gate.command, timeoutMs)
  const recoveryProblem = completionProblem(clean)
  if (recoveryProblem !== null) return { status: 'error', detail: 'gate ' + recoveryProblem + ' after revert' }
  if (outputViolations(clean.output, gate.expect).length > 0) return { status: 'error', detail: 'gate still fails after revert' }
  return { status: 'ok', detail: 'fired on the failure and passed after revert' }
}
