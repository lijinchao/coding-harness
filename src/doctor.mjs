import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

const DECISION_SECTIONS = ['Problem', 'Decision', 'Alternatives', 'Consequences']
const CODEOWNERS = ['CODEOWNERS', '.github/CODEOWNERS', 'docs/CODEOWNERS']

/**
 * Governance facts the manifest declares and a program can check.
 *
 * This detects "governance fact drift": a README that names an old version, a
 * decision record missing a required section, or an owner nobody routes to.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object} manifest - A valid manifest.
 * @returns {string[]} One message per problem; empty means consistent.
 */
export function doctorProblems(root, manifest) {
  const problems = []
  const governance = manifest.governance
  if (governance === undefined) return problems

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
      }
    }
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

  if (manifest.lock?.proofs !== undefined) {
    const ids = new Set(manifest.gates.map((gate) => gate.id))
    for (const id of Object.keys(manifest.lock.proofs)) {
      if (!ids.has(id)) problems.push('lock.proofs references unknown gate ' + id)
    }
  }

  return problems
}
