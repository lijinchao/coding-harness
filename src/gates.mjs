import { installForwarding, removeForwarding, runCommand, terminateAll } from './process.mjs'

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

function skippedResult(gate, reason) {
  return { id: gate.id, severity: gate.severity, ok: false, skipped: true, reason, code: 0, signal: null, timedOut: false, violations: [], ms: 0, output: '' }
}

async function runOne(root, gate, timeoutMs) {
  // A gate may need a product the repository cannot commit; the setup runs
  // first, in the same shell contract, and a setup failure is a gate failure.
  const command = gate.setup_command === undefined ? gate.command : gate.setup_command + ' && ' + gate.command
  const result = await runCommand(root, command, timeoutMs)
  const violations = outputViolations(result.output, gate.expect)
  return {
    id: gate.id,
    severity: gate.severity,
    ok: result.code === 0 && !result.timedOut && violations.length === 0,
    skipped: false,
    reason: null,
    code: result.code,
    signal: result.signal,
    timedOut: result.timedOut,
    violations,
    ms: result.ms,
    output: result.output,
  }
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
