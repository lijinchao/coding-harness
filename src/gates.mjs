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
        skipped: false,
        reason: null,
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

function skippedResult(gate, reason) {
  return { id: gate.id, severity: gate.severity, ok: false, skipped: true, reason, code: 0, signal: null, timedOut: false, violations: [], ms: 0, output: '' }
}

/**
 * Run gates, honouring dependencies, with a per-gate timeout and a worker cap.
 *
 * A gate may declare `needs` (dependencies that must pass) and `after`
 * (ordering only). A gate whose blocking dependency failed or was skipped is
 * itself skipped, so a broken prerequisite never looks like a passing check.
 * With `failFast`, no new gate starts after a blocking gate fails; a timeout
 * kills the gate's process group (SIGTERM, then SIGKILL).
 *
 * @returns {Promise<{ id: string, severity: string, ok: boolean, skipped: boolean, reason: string|null, code: number, signal: string|null, timedOut: boolean, violations: string[], ms: number, output: string }[]>}
 */
export async function runGates(root, gates, options = {}) {
  const timeoutMs = options.timeoutMs ?? 0
  const jobs = Math.max(1, options.jobs ?? 1)
  const failFast = options.failFast === true
  const byId = new Map(gates.map((gate) => [gate.id, gate]))
  const results = new Map()
  const started = new Set()
  const running = new Map()
  let stop = false

  const upstream = (gate) => [...(gate.needs ?? []), ...(gate.after ?? [])].filter((id) => byId.has(id))
  const blocked = (gate) => (gate.needs ?? []).filter((id) => byId.has(id)).some((id) => {
    const dependency = results.get(id)
    return dependency.skipped === true || (dependency.ok === false && dependency.severity !== 'advisory')
  })
  const ready = () => gates.filter((gate) => !started.has(gate.id) && upstream(gate).every((id) => results.has(id)))

  installForwarding()
  try {
    for (;;) {
      let progressed = false
      for (const gate of ready()) {
        if (running.size >= jobs) break
        progressed = true
        started.add(gate.id)
        if (stop) { results.set(gate.id, skippedResult(gate, 'fail-fast')); continue }
        if (blocked(gate)) { results.set(gate.id, skippedResult(gate, 'dependency')); continue }
        running.set(gate.id, runOne(root, gate, timeoutMs).then((result) => {
          results.set(gate.id, result)
          running.delete(gate.id)
          if (failFast && result.ok === false && gate.severity === 'blocking') stop = true
        }))
      }
      if (running.size > 0) {
        await Promise.race(running.values())
        continue
      }
      if (!progressed) break
    }
  } finally {
    removeForwarding()
    terminateAll('SIGKILL')
  }
  return gates.map((gate) => results.get(gate.id) ?? skippedResult(gate, 'unreachable'))
}
