import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { adoptionProblems } from './adopt.mjs'
import { decisionProblems, documentProblems, instructionProblems } from './documents.mjs'
import { productProblems } from './product.mjs'

const DECISION_SECTIONS = ['Problem', 'Decision', 'Alternatives', 'Consequences']
const CHANGE_SECTIONS = ['Verification']
const CODEOWNERS = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']

/**
 * Governance facts the manifest declares and a program can check, split into
 * blocking problems and advisory warnings.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object} manifest - A valid manifest.
 * @param {object} [requirements] - The pinned base's declared requirements.
 * @returns {{ problems: string[], warnings: string[] }}
 */
export function doctorReport(root, manifest, requirements) {
  const adoption = adoptionProblems(manifest, requirements)
  const problems = [...adoption.problems]
  const warnings = [...adoption.warnings]

  if (manifest.lock?.proofs !== undefined) {
    const ids = new Set(manifest.gates.map((gate) => gate.id))
    for (const id of Object.keys(manifest.lock.proofs)) {
      if (!ids.has(id)) problems.push('lock.proofs references unknown gate ' + id)
    }
  }

  if (manifest.product !== undefined) problems.push(...productProblems(root, manifest.product))

  const governance = manifest.governance
  if (governance === undefined) return { problems, warnings }

  for (const rel of governance.version ?? []) {
    const path = resolve(root, rel)
    if (!existsSync(path)) { problems.push(rel + ': version file not found'); continue }
    if (!readFileSync(path, 'utf8').includes('v' + manifest.version)) problems.push(rel + ': does not mention v' + manifest.version)
  }

  if (governance.decisions !== undefined) {
    const dir = resolve(root, governance.decisions)
    if (existsSync(dir)) {
      for (const name of readdirSync(dir).slice().sort()) {
        if (!name.endsWith('.md')) continue
        const text = readFileSync(resolve(dir, name), 'utf8')
        for (const section of DECISION_SECTIONS) {
          if (!new RegExp('^## ' + section + '\\b', 'm').test(text)) problems.push(governance.decisions + '/' + name + ': missing section ## ' + section)
        }
        problems.push(...decisionProblems(root, governance.decisions + '/' + name, text))
      }
    }
  }

  if (governance.changes !== undefined) {
    const dir = resolve(root, governance.changes)
    if (!existsSync(dir)) {
      problems.push(governance.changes + ': change-record directory not found')
    } else {
      for (const name of readdirSync(dir).slice().sort()) {
        if (!name.endsWith('.md') || name === 'README.md') continue
        const text = readFileSync(resolve(dir, name), 'utf8')
        for (const section of CHANGE_SECTIONS) {
          if (!new RegExp('^## ' + section + '\\b', 'm').test(text)) problems.push(governance.changes + '/' + name + ': missing section ## ' + section)
        }
        const reference = text.match(/^decision:\s*(\S+)/im)
        if (reference !== null && !existsSync(resolve(root, reference[1]))) problems.push(governance.changes + '/' + name + ': decision reference not found: ' + reference[1])
      }
    }
  }

  if (governance.manualVerification !== undefined && !existsSync(resolve(root, governance.manualVerification))) {
    problems.push(governance.manualVerification + ': manual verification path not found')
  }

  if ((governance.owners ?? []).length > 0) {
    const found = CODEOWNERS.map((rel) => resolve(root, rel)).filter(existsSync)
    if (found.length === 0) {
      problems.push('no CODEOWNERS file found for declared owners')
    } else {
      const text = found.map((path) => readFileSync(path, 'utf8')).join('\n')
      for (const owner of governance.owners) if (!text.includes(owner)) problems.push('CODEOWNERS does not route to ' + owner)
    }
  }

  if (governance.docs !== undefined) problems.push(...documentProblems(root, governance.docs))
  if (governance.instructions !== undefined) problems.push(...instructionProblems(root, governance.instructions))

  const ciCommands = requirements?.requiredCiCommands ?? []
  for (const rel of governance.ci ?? []) {
    const path = resolve(root, rel)
    if (!existsSync(path)) { problems.push(rel + ': CI file not found'); continue }
    const text = readFileSync(path, 'utf8')
    for (const command of ciCommands) if (!text.includes(command)) problems.push(rel + ': does not run "' + command + '"')
  }

  return { problems, warnings }
}

/**
 * Blocking governance problems only. Kept for callers that do not surface warnings.
 *
 * @returns {string[]}
 */
export function doctorProblems(root, manifest, requirements) {
  return doctorReport(root, manifest, requirements).problems
}
