/**
 * Map a changed file set to the gates that must run.
 *
 * A manifest may declare `surfaces`, each with path globs and the gate ids that
 * surface requires. Selection is the union over the changed files plus the gates
 * marked `always`. Without `surfaces` every gate is selected, which is the safe
 * default for a repository that has not built the matrix yet.
 */

const SPECIAL = /[.+^${}()|[\]\\]/g

/**
 * True when a repository-relative path matches a glob.
 *
 * Supports `*` (within one path segment), `?` (one character within a segment),
 * and `**` (any number of segments, including none).
 *
 * @param {string} path - Repository-relative path.
 * @param {string} pattern - Glob pattern.
 * @returns {boolean}
 */
export function matchGlob(path, pattern) {
  let regex = ''
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]
    if (char === '*') {
      if (pattern[index + 1] === '*') {
        index += 1
        if (pattern[index + 1] === '/') {
          index += 1
          regex += '(?:[^/]+/)*'
        } else {
          regex += '.*'
        }
      } else {
        regex += '[^/]*'
      }
    } else if (char === '?') {
      regex += '[^/]'
    } else {
      regex += char.replace(SPECIAL, '\\$&')
    }
  }
  return new RegExp('^' + regex + '$').test(path)
}

/**
 * The gate ids a change selects, in manifest order.
 *
 * @param {object} manifest - A valid manifest.
 * @param {string[]} changed - Repository-relative paths that changed.
 * @returns {string[]}
 */
export function selectedGateIds(manifest, changed) {
  const surfaces = manifest.surfaces ?? []
  if (surfaces.length === 0) return manifest.gates.map((gate) => gate.id)
  const required = new Set()
  for (const surface of surfaces) {
    if (changed.some((file) => surface.paths.some((pattern) => matchGlob(file, pattern)))) {
      for (const id of surface.requires) required.add(id)
    }
  }
  for (const gate of manifest.gates) if (gate.always === true) required.add(gate.id)
  return manifest.gates.map((gate) => gate.id).filter((id) => required.has(id))
}
