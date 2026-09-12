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
const ROOT_KEYS = ['version', 'tool', 'base', 'governance', 'compositions', 'skills', 'gates', 'lock']
const COMPOSITION_KEYS = ['output', 'sources']
const SKILL_KEYS = ['id', 'path', 'trigger', 'owner']
const GATE_KEYS = ['id', 'command', 'protects', 'prove_fires', 'prove_fires_command', 'revert_command', 'severity', 'expect']
const EXPECT_KEYS = ['forbid', 'allow']
const BASE_KEYS = ['source', 'registry', 'cache']
const TOOL_KEYS = ['version', 'commit', 'source']
const LOCK_KEYS = ['version', 'tool', 'base', 'outputs', 'proofs']
const LOCK_TOOL_KEYS = ['version', 'commit', 'files']
const LOCK_BASE_KEYS = ['version', 'files']
const GOVERNANCE_KEYS = ['version', 'decisions', 'owners', 'ci', 'changes', 'manualVerification']

function requireString(errors, value, where) {
  if (typeof value !== 'string' || value.length === 0) errors.push(where + ': required non-empty string')
}

function requireObject(errors, value, where) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) errors.push(where + ': required object')
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function rejectUnknown(errors, value, allowed, where) {
  if (!isObject(value)) return
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) errors.push(where + '.' + key + ': unknown field')
  }
}

function requireUniqueIds(errors, items, where) {
  const seen = new Set()
  items.forEach((item, index) => {
    const id = item?.id
    if (typeof id !== 'string') return
    if (seen.has(id)) errors.push(where + '[' + index + '].id: duplicate id ' + id)
    seen.add(id)
  })
}

function validateBase(errors, base) {
  if (base === undefined) return
  requireObject(errors, base, 'base')
  rejectUnknown(errors, base, BASE_KEYS, 'base')
  if (!isObject(base)) return
  requireString(errors, base.source, 'base.source')
  if (base.registry !== undefined) requireString(errors, base.registry, 'base.registry')
  if (base.cache !== undefined) requireString(errors, base.cache, 'base.cache')
}

function validateTool(errors, tool) {
  if (tool === undefined) return
  requireObject(errors, tool, 'tool')
  rejectUnknown(errors, tool, TOOL_KEYS, 'tool')
  if (!isObject(tool)) return
  requireString(errors, tool.version, 'tool.version')
  if (tool.commit !== undefined) requireString(errors, tool.commit, 'tool.commit')
  if (tool.source !== undefined) requireString(errors, tool.source, 'tool.source')
}

function validateGovernance(errors, governance) {
  if (governance === undefined) return
  requireObject(errors, governance, 'governance')
  rejectUnknown(errors, governance, GOVERNANCE_KEYS, 'governance')
  if (!isObject(governance)) return
  if (governance.version !== undefined) {
    if (!Array.isArray(governance.version)) errors.push('governance.version: required array')
    else governance.version.forEach((entry, index) => requireString(errors, entry, 'governance.version[' + index + ']'))
  }
  if (governance.decisions !== undefined) requireString(errors, governance.decisions, 'governance.decisions')
  if (governance.owners !== undefined) {
    if (!Array.isArray(governance.owners)) errors.push('governance.owners: required array')
    else governance.owners.forEach((entry, index) => requireString(errors, entry, 'governance.owners[' + index + ']'))
  }
  if (governance.ci !== undefined) {
    if (!Array.isArray(governance.ci)) errors.push('governance.ci: required array')
    else governance.ci.forEach((entry, index) => requireString(errors, entry, 'governance.ci[' + index + ']'))
  }
  if (governance.changes !== undefined) requireString(errors, governance.changes, 'governance.changes')
  if (governance.manualVerification !== undefined) requireString(errors, governance.manualVerification, 'governance.manualVerification')
}

function validateExpect(errors, expect, where) {
  if (expect === undefined) return
  requireObject(errors, expect, where)
  rejectUnknown(errors, expect, EXPECT_KEYS, where)
  if (!isObject(expect)) return
  if (expect.forbid !== undefined) {
    if (!Array.isArray(expect.forbid) || expect.forbid.length === 0) errors.push(where + '.forbid: required non-empty array')
    else expect.forbid.forEach((pattern, index) => requireString(errors, pattern, where + '.forbid[' + index + ']'))
  }
  if (expect.allow !== undefined) {
    if (!Array.isArray(expect.allow)) errors.push(where + '.allow: required array')
    else expect.allow.forEach((pattern, index) => requireString(errors, pattern, where + '.allow[' + index + ']'))
  }
}

function validateLockTool(errors, tool) {
  requireObject(errors, tool, 'lock.tool')
  rejectUnknown(errors, tool, LOCK_TOOL_KEYS, 'lock.tool')
  if (!isObject(tool)) return
  requireString(errors, tool.version, 'lock.tool.version')
  if (tool.commit !== undefined) requireString(errors, tool.commit, 'lock.tool.commit')
  if (tool.files !== undefined) requireObject(errors, tool.files, 'lock.tool.files')
}

function validateLock(errors, lock) {
  if (lock === undefined) return
  requireObject(errors, lock, 'lock')
  rejectUnknown(errors, lock, LOCK_KEYS, 'lock')
  if (!isObject(lock)) return
  requireString(errors, lock.version, 'lock.version')
  requireObject(errors, lock.outputs, 'lock.outputs')
  if (lock.proofs !== undefined) requireObject(errors, lock.proofs, 'lock.proofs')
  if (lock.tool !== undefined) validateLockTool(errors, lock.tool)
  if (lock.base !== undefined) {
    requireObject(errors, lock.base, 'lock.base')
    rejectUnknown(errors, lock.base, LOCK_BASE_KEYS, 'lock.base')
    if (isObject(lock.base)) {
      requireString(errors, lock.base.version, 'lock.base.version')
      requireObject(errors, lock.base.files, 'lock.base.files')
    }
  }
}

/**
 * Return the structural errors in a manifest.
 *
 * The JSON schema in `schema/` is the normative contract; this function
 * implements it, including unknown fields, duplicate ids, and the rule that a
 * blocking gate must declare a runnable proof.
 *
 * @param {unknown} manifest - A parsed manifest.
 * @returns {string[]} One message per violation; empty means valid.
 */
export function validateManifest(manifest) {
  const errors = []
  if (!isObject(manifest)) return ['root: required object']
  rejectUnknown(errors, manifest, ROOT_KEYS, 'root')
  requireString(errors, manifest.version, 'version')
  validateBase(errors, manifest.base)
  validateTool(errors, manifest.tool)
  validateGovernance(errors, manifest.governance)

  if (!Array.isArray(manifest.compositions) || manifest.compositions.length === 0) {
    errors.push('compositions: required non-empty array')
  } else {
    manifest.compositions.forEach((composition, index) => {
      const where = 'compositions[' + index + ']'
      requireObject(errors, composition, where)
      rejectUnknown(errors, composition, COMPOSITION_KEYS, where)
      requireString(errors, composition?.output, where + '.output')
      if (!Array.isArray(composition?.sources) || composition.sources.length === 0) {
        errors.push(where + '.sources: required non-empty array')
      } else {
        composition.sources.forEach((source, sourceIndex) => requireString(errors, source, where + '.sources[' + sourceIndex + ']'))
      }
    })
  }

  if (!Array.isArray(manifest.skills)) {
    errors.push('skills: required array')
  } else {
    manifest.skills.forEach((skill, index) => {
      const where = 'skills[' + index + ']'
      requireObject(errors, skill, where)
      rejectUnknown(errors, skill, SKILL_KEYS, where)
      SKILL_FIELDS.forEach((field) => requireString(errors, skill?.[field], where + '.' + field))
    })
    requireUniqueIds(errors, manifest.skills, 'skills')
  }

  if (!Array.isArray(manifest.gates)) {
    errors.push('gates: required array')
  } else {
    manifest.gates.forEach((gate, index) => {
      const where = 'gates[' + index + ']'
      requireObject(errors, gate, where)
      rejectUnknown(errors, gate, GATE_KEYS, where)
      GATE_FIELDS.forEach((field) => requireString(errors, gate?.[field], where + '.' + field))
      if (gate?.severity !== undefined && !['blocking', 'advisory'].includes(gate.severity)) {
        errors.push(where + '.severity: must be blocking or advisory')
      }
      if (gate?.severity === 'blocking') {
        requireString(errors, gate.prove_fires_command, where + '.prove_fires_command')
        requireString(errors, gate.revert_command, where + '.revert_command')
      }
      validateExpect(errors, gate?.expect, where + '.expect')
    })
    requireUniqueIds(errors, manifest.gates, 'gates')
  }

  validateLock(errors, manifest.lock)
  return errors
}
