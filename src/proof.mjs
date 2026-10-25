import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, relative, resolve, sep, posix } from 'node:path'

/**
 * The gate fields that decide whether the gate fires.
 *
 * Prose such as `protects` is deliberately excluded: rewording what a gate
 * defends does not invalidate the run that watched it fail.
 */
const DEFINITION_KEYS = ['id', 'command', 'setup_command', 'prove_fires_command', 'revert_command', 'expect', 'severity', 'phase', 'needs', 'after', 'always', 'proof_inputs']

/** Explicit checker files only: no guessed shell dependencies or product-wide hash. */
export function snapshotProofInputs(root, gate) {
  if (gate.proof_inputs === undefined) return undefined
  if (!root) throw new Error('proof inputs require the repository root')
  const base = realpathSync(root)
  const tracked = new Set(execFileSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8', stdio: 'pipe' }).split('\0').filter(Boolean))
  const entries = [], seen = new Set()
  for (const path of [...gate.proof_inputs].sort()) {
    if (typeof path !== 'string' || !path || isAbsolute(path) || /^[A-Za-z]:/.test(path) || /[\\*?\[\]]/.test(path) || path.split('/').includes('..') || posix.normalize(path) !== path) throw new Error('invalid proof input path: ' + path)
    if (seen.has(path)) throw new Error('duplicate proof input: ' + path)
    seen.add(path)
    if (!tracked.has(path)) throw new Error('proof input is not tracked: ' + path)
    const file = resolve(root, path)
    try {
      const info = lstatSync(file)
      const rel = relative(base, realpathSync(file))
      if (!info.isFile() || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) throw new Error('not a regular repository file')
      entries.push([path, createHash('sha256').update(readFileSync(file)).digest('hex')])
    } catch (error) { throw new Error('cannot read proof input ' + path + ': ' + error.message) }
  }
  return Object.fromEntries(entries)
}

/**
 * The behavioural definition of a gate.
 *
 * @param {object} gate - A valid gate.
 * @returns {object}
 */
export function gateDefinition(gate) {
  const definition = {}
  for (const key of DEFINITION_KEYS) if (gate[key] !== undefined) definition[key] = gate[key]
  return definition
}

/**
 * SHA-256 of a gate's behavioural definition.
 *
 * @param {object} gate - A valid gate.
 * @returns {string}
 */
export function definitionHash(gate) {
  return createHash('sha256').update(JSON.stringify(gateDefinition(gate))).digest('hex')
}

/**
 * Records that name a gate the manifest no longer declares.
 *
 * A static fact, so a gate can carry it: it says nothing about whether a proof
 * is current, which only `prove` can tell while it is also the thing that
 * repairs it.
 *
 * @param {object} manifest - A valid manifest.
 * @returns {string[]}
 */
export function proofIdProblems(manifest) {
  const proofs = manifest.lock?.proofs ?? {}
  const ids = new Set(manifest.gates.map((gate) => gate.id))
  const problems = []
  for (const id of Object.keys(proofs)) {
    if (!ids.has(id)) problems.push('lock.proofs references unknown gate ' + id)
  }
  return problems
}

/**
 * Problems with the recorded proofs, against the policy the repository declares.
 *
 * A proof is evidence that one gate definition was watched to fail and pass by
 * one tool build at one time. `governance.proofs` states which gates must carry
 * that evidence (`require`: `blocking`, `all`, or `none`) and how old it may
 * be (`maxAgeDays`, default 30). Without the key no proof is demanded, and only
 * a record naming a gate that no longer exists is reported.
 *
 * @param {object} manifest - A valid manifest.
 * @param {string} [tool] - The commit of the running tool.
 * @param {Set<string>} [only] - Gate ids to demand when only some are being proved.
 * @returns {string[]}
 */
export function proofProblems(manifest, tool, only, root) {
  const proofs = manifest.lock?.proofs ?? {}
  const problems = proofIdProblems(manifest)
  const policy = manifest.governance?.proofs
  if (policy === undefined) return problems
  const scope = policy.require ?? 'blocking'
  if (scope === 'none') return problems
  const maxAgeDays = policy.maxAgeDays ?? 30
  const commit = tool ?? 'unknown'
  const now = Date.now()
  for (const gate of manifest.gates) {
    if (only !== undefined && !only.has(gate.id)) continue
    if (scope !== 'all' && gate.severity !== 'blocking') continue
    if (policy.requireInputs === true && !gate.proof_inputs?.length) problems.push('gate ' + gate.id + ': proof_inputs required by policy')
    if (gate.proof_inputs !== undefined) {
      try {
        const current = snapshotProofInputs(root, gate)
        const held = proofs[gate.id]?.inputs
        const same = held !== null && typeof held === 'object' && JSON.stringify(Object.keys(held).sort()) === JSON.stringify(Object.keys(current)) && Object.entries(current).every(([path, digest]) => held[path] === digest)
        if (!same) problems.push('gate ' + gate.id + ': proof inputs changed or are unbound; run harness prove --record')
      } catch (error) { problems.push('gate ' + gate.id + ': ' + error.message) }
    }
    const record = proofs[gate.id]
    if (record === undefined) {
      problems.push('gate ' + gate.id + ': no recorded proof; run harness prove --record')
      continue
    }
    if (typeof record !== 'object' || record === null) {
      problems.push('gate ' + gate.id + ': proof is not bound to its gate definition; run harness prove --record')
      continue
    }
    if (record.definition !== definitionHash(gate)) problems.push('gate ' + gate.id + ': the gate changed since it was proved; run harness prove --record')
    if (record.tool !== commit) problems.push('gate ' + gate.id + ': proof was recorded by tool ' + record.tool + ', not ' + commit + '; run harness prove --record')
    const age = (now - Date.parse(record.at)) / 86400000
    if (!Number.isFinite(age)) problems.push('gate ' + gate.id + ': proof timestamp is unreadable; run harness prove --record')
    else if (age > maxAgeDays) problems.push('gate ' + gate.id + ': proof is ' + Math.floor(age) + ' days old, past the declared ' + maxAgeDays + '; run harness prove --record')
  }
  return problems
}
