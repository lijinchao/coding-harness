import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadRelease } from './release.mjs'

const digest = (value) => createHash('sha256').update(value).digest('hex')

/** The fields an attestation binds, recomputed from the repository. */
function bindings(root, manifest, options = {}) {
  const { release } = loadRelease(resolve(root, manifest.base?.registry ?? 'dist'), manifest.version)
  const locks = { self: digest(JSON.stringify(manifest.lock ?? {})) }
  if (options.example !== undefined) locks.example = digest(readFileSync(resolve(root, options.example), 'utf8'))
  let tag = null
  try {
    tag = execFileSync('git', ['-C', root, 'rev-parse', 'v' + manifest.version], { stdio: 'pipe' }).toString().trim()
  } catch {
    // A release without its tag is reported by verification, not here.
  }
  return {
    version: manifest.version,
    toolCommit: manifest.tool?.commit ?? null,
    tag,
    base: { version: release.version, release: digest(JSON.stringify(release.files)) },
    locks,
    proofs: Object.fromEntries(
      Object.entries(manifest.lock?.proofs ?? {}).map(([id, record]) => [id, { tool: record.tool, definition: record.definition }]),
    ),
  }
}

/**
 * Build the attestation a release is accepted by: the version, the tag commit,
 * the base release record, the locked state, and the proof set.
 *
 * @param {string} root - Repository root.
 * @param {object} manifest - A valid manifest, packs merged.
 * @param {object} [options] - `{ example }`, a second manifest to bind.
 * @returns {object}
 */
export function buildAttestation(root, manifest, options = {}) {
  return { at: new Date().toISOString(), ...bindings(root, manifest, options) }
}

/**
 * Recompute every binding and report what moved.
 *
 * @param {string} root - Repository root.
 * @param {object} manifest - A valid manifest, packs merged.
 * @param {object} attestation - What `buildAttestation` wrote.
 * @param {object} [options] - `{ example }`, as for the build.
 * @returns {string[]}
 */
export function verifyAttestation(root, manifest, attestation, options = {}) {
  const actual = bindings(root, manifest, options)
  const problems = []
  if (attestation.version !== actual.version) problems.push('version: attested ' + attestation.version + ', now ' + actual.version)
  if (attestation.toolCommit !== actual.toolCommit) problems.push('tool commit: attested ' + attestation.toolCommit + ', now ' + actual.toolCommit)
  if (actual.tag === null) problems.push('tag v' + actual.version + ' does not exist')
  else if (actual.tag !== actual.toolCommit) problems.push('tag v' + actual.version + ' points at ' + actual.tag + ', not the pinned tool commit ' + actual.toolCommit)
  if (attestation.base?.release !== actual.base.release) problems.push('base release record changed since the attestation')
  if (attestation.locks?.self !== actual.locks.self) problems.push('the lock changed since the attestation; re-record and attest again')
  if (attestation.locks?.example !== actual.locks.example) problems.push('the bound manifest changed since the attestation')
  if (JSON.stringify(attestation.proofs) !== JSON.stringify(actual.proofs)) problems.push('the proof set changed since the attestation')
  for (const [id, record] of Object.entries(actual.proofs)) {
    if (record.tool !== actual.toolCommit) problems.push('proof for ' + id + ' is bound to ' + record.tool + ', not the pinned tool commit')
  }
  return problems
}
