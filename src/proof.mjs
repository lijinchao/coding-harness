import { createHash } from 'node:crypto'

/**
 * The gate fields that decide whether the gate fires.
 *
 * Prose such as `protects` is deliberately excluded: rewording what a gate
 * defends does not invalidate the run that watched it fail.
 */
const DEFINITION_KEYS = ['id', 'command', 'prove_fires_command', 'revert_command', 'expect', 'severity', 'phase', 'needs', 'after', 'always']

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
export function proofProblems(manifest, tool, only) {
  const proofs = manifest.lock?.proofs ?? {}
  const problems = []
  const ids = new Set(manifest.gates.map((gate) => gate.id))
  for (const id of Object.keys(proofs)) {
    if (!ids.has(id)) problems.push('lock.proofs references unknown gate ' + id)
  }
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
