import { spawn } from 'node:child_process'

const KILL_GRACE_MS = 5000
const active = new Set()
const forwarding = new Map()

/**
 * Signal a gate's whole process group, falling back to the direct child.
 *
 * A gate runs under a shell, so killing the shell alone can leave its children
 * and grandchildren running past the timeout.
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

function terminateAll(signal) {
  for (const child of active) killTree(child, signal)
}

function removeForwarding() {
  for (const [signal, handler] of forwarding) process.off(signal, handler)
  forwarding.clear()
}

function installForwarding() {
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

function outputViolations(output, expect) {
  if (expect === undefined || expect.forbid === undefined) return []
  const allow = expect.allow ?? []
  const lines = output.split('\n')
  const violations = []
  for (const pattern of expect.forbid) {
    const hit = lines.some((line) => line.includes(pattern) && !allow.some((benign) => line.includes(benign)))
    if (hit) violations.push(pattern)
  }
  return violations
}

function runOne(root, gate, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(gate.command, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' })
    active.add(child)
    const startedAt = Date.now()
    let output = ''
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
      active.delete(child)
      if (timer !== null) clearTimeout(timer)
      if (killTimer !== null) clearTimeout(killTimer)
      const violations = outputViolations(output, gate.expect)
      resolve({
        id: gate.id,
        severity: gate.severity,
        ok: code === 0 && !timedOut && violations.length === 0,
        code: code ?? 1,
        signal: signal ?? null,
        timedOut,
        violations,
        ms: Date.now() - startedAt,
        output,
      })
    }
    child.on('close', finish)
    child.on('error', (error) => { output += String(error.message); finish(1, null) })
  })
}

/**
 * Run gates, optionally in parallel and with a per-gate timeout.
 *
 * A gate passes only when its command exits zero, does not time out, and its
 * output does not contain a forbidden pattern (unless the matching line is
 * allow-listed). A timeout kills the gate's process group: SIGTERM first, then
 * SIGKILL after a grace period. Exit code, signal, and timeout are reported
 * separately so a killed gate is never mistaken for a clean one.
 *
 * @returns {Promise<{ id: string, severity: string, ok: boolean, code: number, signal: string|null, timedOut: boolean, violations: string[], ms: number, output: string }[]>}
 */
export async function runGates(root, gates, options = {}) {
  const timeoutMs = options.timeoutMs ?? 0
  const jobs = Math.max(1, options.jobs ?? 1)
  const results = new Array(gates.length)
  let next = 0
  const worker = async () => {
    for (;;) {
      const index = next
      next += 1
      if (index >= gates.length) return
      results[index] = await runOne(root, gates[index], timeoutMs)
    }
  }
  installForwarding()
  try {
    await Promise.all(Array.from({ length: Math.min(jobs, gates.length) }, () => worker()))
  } finally {
    removeForwarding()
    terminateAll('SIGKILL')
  }
  return results
}
