import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveBase } from './state.mjs'

/** Marks a merged manifest with the file object a sync must persist. */
export const PACK_RAW = Symbol('packRaw')

/** Keys a pack descriptor may declare. */
export const PACK_DESCRIPTOR_KEYS = ['id', 'version', 'kernelVersion', 'gates', 'surfaces', 'skills', 'packs', 'conflicts']

function parseVersion(text) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(text).trim())
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])]
}

function atLeast(version, minimum) {
  for (let i = 0; i < 3; i += 1) {
    if (version[i] > minimum[i]) return true
    if (version[i] < minimum[i]) return false
  }
  return true
}

/**
 * Resolve one declared pack to its verified release and descriptor.
 *
 * A pack is a base-shaped release: the same fetch, hash, and verification path
 * the kernel uses for itself, so a pack never introduces a second mechanism.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object} declaration - `{ id, source, version, registry?, cache? }`.
 * @param {string} kernelVersion - The base version the repository pins.
 * @returns {{ id: string, dir: string, release: object, descriptor: object }}
 */
export function resolvePack(root, declaration, kernelVersion) {
  const { dir, release } = resolveBase(root, {
    version: declaration.version,
    base: { source: declaration.source, registry: declaration.registry, cache: declaration.cache },
  })
  const path = resolve(dir, 'pack.json')
  let descriptor
  try {
    descriptor = JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    throw new Error('pack ' + declaration.id + ': pack.json is missing or unreadable in ' + declaration.version + ' (' + error.message + ')')
  }
  const problems = packProblems(descriptor, declaration, kernelVersion)
  if (problems.length > 0) throw new Error(problems[0])
  return { id: declaration.id, dir, release, descriptor }
}

/**
 * Problems with a pack descriptor against its declaration and the kernel.
 *
 * @param {object} descriptor - The pack's own `pack.json`.
 * @param {object} declaration - The repository's declaration.
 * @param {string} kernelVersion - The base version the repository pins.
 * @returns {string[]}
 */
export function packProblems(descriptor, declaration, kernelVersion) {
  const problems = []
  const where = 'pack ' + declaration.id
  for (const key of Object.keys(descriptor)) {
    if (!PACK_DESCRIPTOR_KEYS.includes(key)) problems.push(where + ': ' + key + ' is not a pack descriptor field')
  }
  if (descriptor.id !== declaration.id) problems.push(where + ': descriptor id ' + descriptor.id + ' does not match the declaration')
  const kernel = parseVersion(kernelVersion)
  const minimum = descriptor.kernelVersion === undefined ? null : parseVersion(String(descriptor.kernelVersion).replace(/^>=/, ''))
  if (descriptor.kernelVersion !== undefined && minimum === null) problems.push(where + ': kernelVersion must be a version or >= a version')
  if (minimum !== null && kernel !== null && !atLeast(kernel, minimum)) {
    problems.push(where + ': needs kernel >= ' + minimum.join('.') + ' but this repository pins ' + kernelVersion)
  }
  for (const kind of ['gates', 'surfaces', 'skills']) {
    for (const entry of descriptor[kind] ?? []) {
      if (typeof entry?.id !== 'string' || !entry.id.startsWith(descriptor.id + '/')) {
        problems.push(where + ': ' + kind.slice(0, -1) + ' id ' + entry?.id + ' must be namespaced ' + descriptor.id + '/<name>')
      }
    }
  }
  return problems
}

function describe(kind, entry) {
  if (kind === 'gates') return entry.command
  if (kind === 'surfaces') return (entry.paths ?? []).join(', ')
  return entry.path ?? ''
}

/**
 * What one pack version would add, change, or remove against the declared one.
 *
 * The contribution is read from the pack's own \`pack.json\` at both versions, so
 * the report names commands and paths, not only files.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object} manifest - A valid manifest.
 * @param {string} id - The pack id.
 * @param {string} toVersion - The version to compare against.
 * @returns {{ from: string, to: string, lines: string[] }}
 */
export function packDiff(root, manifest, id, toVersion) {
  const declaration = (manifest.packs ?? []).find((entry) => entry.id === id)
  if (declaration === undefined) throw new Error('pack not declared: ' + id)
  const kernelVersion = manifest.version
  const before = resolvePack(root, declaration, kernelVersion)
  const after = resolvePack(root, { ...declaration, version: toVersion }, kernelVersion)
  const lines = []
  for (const kind of ['gates', 'surfaces', 'skills']) {
    const old = new Map((before.descriptor[kind] ?? []).map((entry) => [entry.id, entry]))
    const next = new Map((after.descriptor[kind] ?? []).map((entry) => [entry.id, entry]))
    for (const [entryId, entry] of next) {
      const label = kind.slice(0, -1) + ' ' + entryId
      if (!old.has(entryId)) lines.push('  + ' + label + ': ' + describe(kind, entry))
      else if (JSON.stringify(old.get(entryId)) !== JSON.stringify(entry)) lines.push('  ~ ' + label + ': ' + describe(kind, entry))
    }
    for (const [entryId] of old) if (!next.has(entryId)) lines.push('  - ' + kind.slice(0, -1) + ' ' + entryId)
  }
  return { from: declaration.version, to: after.release.version, lines }
}

/**
 * Merge declared packs into a manifest without writing anything.
 *
 * Kernel defaults, then each pack in declaration order, then the repository
 * delta: a pack may not silently replace a repository gate, so a collision is
 * an error unless the repository's gate declares `override: true`, and the
 * lock records what was overridden. The merged manifest carries the on-disk
 * object under `PACK_RAW` so a sync persists the lock without materializing
 * pack contributions into the repository's own file.
 *
 * @param {string} root - Directory the manifest lives in.
 * @param {object} manifest - The manifest as written.
 * @param {object} [options] - `{ kernelVersion }`.
 * @returns {object} The merged manifest.
 */
export function mergePacks(root, manifest, options = {}) {
  if (manifest.packs === undefined || manifest.packs.length === 0) return manifest
  const kernelVersion = options.kernelVersion ?? manifest.version
  const declared = manifest.packs.map((declaration) => declaration.id)
  const resolved = manifest.packs.map((declaration) => {
    const pack = resolvePack(root, declaration, kernelVersion)
    for (const dependency of pack.descriptor.packs ?? []) {
      if (!declared.includes(dependency)) throw new Error('pack ' + pack.id + ': requires pack ' + dependency + ', which is not declared')
    }
    for (const conflict of pack.descriptor.conflicts ?? []) {
      if (declared.includes(conflict)) throw new Error('pack ' + pack.id + ': conflicts with declared pack ' + conflict)
    }
    return pack
  })
  const merged = { ...manifest }
  const packs = {}
  const overrides = []
  for (const kind of ['gates', 'surfaces', 'skills']) {
    const own = manifest[kind] ?? []
    const contributed = []
    for (const pack of resolved) {
      for (const entry of pack.descriptor[kind] ?? []) {
        const existing = own.find((item) => item.id === entry.id)
        if (existing !== undefined) {
          if (existing.override === true) overrides.push(entry.id)
          else throw new Error(entry.id + ': a pack contribution collides with a repository ' + kind.slice(0, -1) + '; declare override: true to keep the repository version')
          continue
        }
        if (contributed.some((item) => item.id === entry.id)) throw new Error(entry.id + ': two packs contribute the same ' + kind.slice(0, -1))
        contributed.push(entry)
      }
    }
    merged[kind] = [...own, ...contributed]
  }
  for (const pack of resolved) {
    packs[pack.id] = { version: pack.release.version, files: pack.release.files }
  }
  const lock = manifest.lock ?? { version: manifest.version, outputs: {} }
  merged.lock = { ...lock, packs }
  if (overrides.length > 0) merged.lock.overrides = overrides.sort()
  Object.defineProperty(merged, PACK_RAW, { value: manifest, enumerable: false })
  return merged
}
