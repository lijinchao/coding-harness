import { spawn } from 'node:child_process'

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
    const child = spawn(gate.command, { cwd: root, shell: true, stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (chunk) => { output += chunk })
    child.stderr.on('data', (chunk) => { output += chunk })
    let timedOut = false
    const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; child.kill('SIGTERM') }, timeoutMs) : null
    const finish = (code) => {
      if (timer !== null) clearTimeout(timer)
      const violations = outputViolations(output, gate.expect)
      resolve({ id: gate.id, severity: gate.severity, ok: code === 0 && !timedOut && violations.length === 0, code: code ?? 1, timedOut, violations, output })
    }
    child.on('close', finish)
    child.on('error', (error) => { output += String(error.message); finish(1) })
  })
}

/**
 * Run gates, optionally in parallel and with a per-gate timeout.
 *
 * A gate passes only when its command exits zero, does not time out, and its
 * output does not contain a forbidden pattern (unless the matching line is
 * allow-listed). Exit code alone is not proof of a clean run.
 *
 * @returns {Promise<{ id: string, severity: string, ok: boolean, code: number, timedOut: boolean, violations: string[], output: string }[]>}
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
  await Promise.all(Array.from({ length: Math.min(jobs, gates.length) }, () => worker()))
  return results
}
