import { readFileSync } from 'node:fs'

/**
 * Parse a manifest file.
 *
 * @param {string} path - Absolute path to a `harness.manifest.json` file.
 * @returns {unknown} The parsed manifest.
 */
export function loadManifest(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

const SKILL_FIELDS = ['id', 'path', 'trigger', 'owner']
const GATE_FIELDS = ['id', 'command', 'protects', 'prove_fires', 'severity']

function requireString(errors, value, where) {
  if (typeof value !== 'string' || value.length === 0) errors.push(`${where}: required non-empty string`)
}

/**
 * Return the structural errors in a manifest.
 *
 * The JSON schema in `schema/` is the normative contract; this function
 * implements the required-field checks the CLI enforces.
 *
 * @param {unknown} manifest - A parsed manifest.
 * @returns {string[]} One message per violation; empty means valid.
 */
export function validateManifest(manifest) {
  const errors = []
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return ['root: required object']
  requireString(errors, manifest.version, 'version')

  if (!Array.isArray(manifest.compositions) || manifest.compositions.length === 0) {
    errors.push('compositions: required non-empty array')
  } else {
    manifest.compositions.forEach((composition, index) => {
      requireString(errors, composition?.output, `compositions[${index}].output`)
      if (!Array.isArray(composition?.sources) || composition.sources.length === 0) {
        errors.push(`compositions[${index}].sources: required non-empty array`)
      } else {
        composition.sources.forEach((source, sourceIndex) => requireString(errors, source, `compositions[${index}].sources[${sourceIndex}]`))
      }
    })
  }

  if (!Array.isArray(manifest.skills)) {
    errors.push('skills: required array')
  } else {
    manifest.skills.forEach((skill, index) => SKILL_FIELDS.forEach((field) => requireString(errors, skill?.[field], `skills[${index}].${field}`)))
  }

  if (!Array.isArray(manifest.gates)) {
    errors.push('gates: required array')
  } else {
    manifest.gates.forEach((gate, index) => {
      GATE_FIELDS.forEach((field) => requireString(errors, gate?.[field], `gates[${index}].${field}`))
      if (gate?.severity !== undefined && !['blocking', 'advisory'].includes(gate.severity)) {
        errors.push(`gates[${index}].severity: must be blocking or advisory`)
      }
    })
  }

  return errors
}
