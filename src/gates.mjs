import { spawn } from 'node:child_process'

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
      resolve({ id: gate.id, severity: gate.severity, ok: code === 0 && !timedOut, code: code ?? 1, timedOut, output })
    }
    child.on('close', finish)
    child.on('error', (error) => { output += String(error.message); finish(1) })
  })
}

/**
 * Run gates, optionally in parallel and with a per-gate timeout.
 *
 * One declared list drives local runs and CI, so the two cannot drift. A
 * blocking failure makes the caller exit non-zero; an advisory failure only
 * warns.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object[]} gates - Gate entries.
 * @param {{ timeoutMs?: number, jobs?: number }} [options]
 * @returns {Promise<{ id: string, severity: string, ok: boolean, code: number, timedOut: boolean, output: string }[]>}
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
