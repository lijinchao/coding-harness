import { spawn } from 'node:child_process'

const KILL_GRACE_MS = 5000
const active = new Set()
const forwarding = new Map()

/**
 * Signal a command's whole process group, falling back to the direct child.
 *
 * A command runs under a shell, so killing the shell alone can leave its
 * children and grandchildren running past the timeout.
 */
function killTree(child, signal) {
  if (child.pid === undefined) return
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch {
    try { child.kill(signal) } catch { /* already gone */ }
  }
}

export function terminateAll(signal) {
  for (const child of active) killTree(child, signal)
}

export function removeForwarding() {
  for (const [signal, handler] of forwarding) process.off(signal, handler)
  forwarding.clear()
}

export function installForwarding() {
  for (const signal of ['SIGINT', 'SIGTERM']) {
    if (forwarding.has(signal)) continue
    const handler = () => {
      terminateAll('SIGKILL')
      removeForwarding()
      process.kill(process.pid, signal)
    }
    forwarding.set(signal, handler)
    process.on(signal, handler)
  }
}

process.on('exit', () => terminateAll('SIGKILL'))

/**
 * Run one shell command in its own process group.
 *
 * A timeout signals the group with SIGTERM, then SIGKILL after a grace period,
 * so a killed command leaves no children. Exit code, signal, timeout, and
 * duration are reported separately.
 *
 * @param {string} root - Working directory.
 * @param {string} command - Shell command.
 * @param {number} [timeoutMs] - Zero means no timeout.
 * @returns {Promise<{ code: number, signal: string|null, timedOut: boolean, ms: number, output: string }>}
 */
export function runCommand(root, command, timeoutMs = 0) {
  return new Promise((resolve) => {
    const child = spawn(command, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
    active.add(child)
    const startedAt = Date.now()
    let output = ''
    let settled = false
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    let timedOut = false
    let killTimer = null
    const timer = timeoutMs > 0 ? setTimeout(() => {
      timedOut = true
      killTree(child, 'SIGTERM')
      killTimer = setTimeout(() => killTree(child, 'SIGKILL'), KILL_GRACE_MS)
    }, timeoutMs) : null
    const finish = (code, signal) => {
      if (settled) return
      settled = true
      active.delete(child)
      if (timer !== null) clearTimeout(timer)
      if (killTimer !== null) clearTimeout(killTimer)
      resolve({ code: code ?? 1, signal: signal ?? null, timedOut, ms: Date.now() - startedAt, output })
    }
    child.on('close', finish)
    child.on('error', (error) => { output += String(error.message); finish(1, null) })
  })
}
