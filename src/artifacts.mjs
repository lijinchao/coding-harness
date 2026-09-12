import { existsSync, readFileSync } from 'node:fs'
import { resolveSource } from './compose.mjs'

const REQUIRED_SECTIONS = ['Inputs', 'Steps', 'Verification', 'Failure']

/**
 * The problems in a skill file's required sections.
 *
 * The artifact contract in docs/reference.md requires a skill to carry its
 * trigger, inputs, steps, verification, and failure. The trigger lives in the
 * manifest; the file must carry the frontmatter name/description and the four
 * sections.
 *
 * @param {string} text - The skill file's contents.
 * @returns {string[]} One message per missing piece; empty means valid.
 */
export function skillProblems(text) {
  const problems = []
  const front = text.match(/^---\n([\s\S]*?)\n---/)
  if (front === null) {
    problems.push('missing frontmatter (name and description)')
  } else {
    if (!/^name:\s*\S/m.test(front[1])) problems.push('frontmatter: missing name')
    if (!/^description:\s*\S/m.test(front[1])) problems.push('frontmatter: missing description')
  }
  for (const section of REQUIRED_SECTIONS) {
    if (!new RegExp('^## ' + section + '\\b', 'm').test(text)) problems.push('missing section ## ' + section)
  }
  return problems
}

/**
 * The problems in the artifact files a manifest declares.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object} manifest - A valid manifest.
 * @param {string} [baseDir] - The fetched base release, when one is pinned.
 * @returns {string[]} One message per problem; empty means valid.
 */
export function artifactProblems(root, manifest, baseDir) {
  const problems = []
  manifest.skills.forEach((skill, index) => {
    let path
    try {
      path = resolveSource(root, baseDir, skill.path)
    } catch (error) {
      problems.push('skills[' + index + '] (' + skill.path + '): ' + error.message)
      return
    }
    if (!existsSync(path)) {
      problems.push('skills[' + index + '] (' + skill.path + '): file not found')
      return
    }
    for (const problem of skillProblems(readFileSync(path, 'utf8'))) {
      problems.push('skills[' + index + '] (' + skill.path + '): ' + problem)
    }
  })
  manifest.gates.forEach((gate, index) => {
    if (/\n/.test(gate.command)) problems.push('gates[' + index + '] (' + gate.id + '): command must be a single line')
  })
  return problems
}
