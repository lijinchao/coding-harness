import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Load a base release's declared requirements, or undefined when it declares none.
 *
 * @param {string} baseDir - The fetched base release directory.
 * @returns {object|undefined}
 */
export function loadRequirements(baseDir) {
  const path = resolve(baseDir, 'requirements.json')
  if (!existsSync(path)) return undefined
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * The capability gap between a consumer manifest and the base it pins.
 *
 * A version pin guarantees the base content and the tool; it does not by
 * itself guarantee that the consumer adopted the base's gates or governance.
 * This is what makes that gap visible.
 *
 * @param {object} manifest - A valid manifest.
 * @param {object} [requirements] - The pinned base's declared requirements.
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function adoptionProblems(manifest, requirements) {
  const problems = []
  const warnings = []
  if (requirements === undefined) return { problems, warnings }
  const gateIds = new Set((manifest.gates ?? []).map((gate) => gate.id))
  for (const id of requirements.requiredGates ?? []) {
    if (!gateIds.has(id)) problems.push('missing required gate: ' + id)
  }
  if (requirements.requireOutputAssertions === true) {
    for (const gate of manifest.gates ?? []) {
      if (gate.severity !== 'blocking') continue
      if (!Array.isArray(gate.expect?.forbid) || gate.expect.forbid.length === 0) problems.push('blocking gate needs expect.forbid: ' + gate.id)
    }
  }
  const governance = manifest.governance ?? {}
  for (const key of requirements.requiredGovernance ?? []) {
    if (governance[key] === undefined) problems.push('missing required governance: ' + key)
  }
  for (const key of requirements.recommendedGovernance ?? []) {
    if (governance[key] === undefined) warnings.push('missing recommended governance: ' + key)
  }
  return { problems, warnings }
}
