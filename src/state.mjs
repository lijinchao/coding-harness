import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { composeText, sha256 } from './compose.mjs'
import { loadRelease, verifyRelease } from './release.mjs'
import { ensureGitCheckout, isGitSource } from './fetch.mjs'
import { toolCommit, toolFiles, toolVersion } from './tool.mjs'
import { adoptionProblems, loadRequirements } from './adopt.mjs'
import { SHIM } from './shim.mjs'
import { PACK_RAW } from './pack.mjs'

function writeAtomic(path, text) {
  const tmp = path + '.tmp'
  writeFileSync(tmp, text)
  renameSync(tmp, path)
}

export { writeAtomic }

/**
 * Resolve and verify the pinned base release, or null when none is pinned.
 */
export function resolveBase(root, manifest) {
  if (manifest.base === undefined) return null
  const config = manifest.base
  let registry
  if (isGitSource(config.source)) {
    const cacheRoot = resolve(root, config.cache ?? '.harness')
    const repoDir = ensureGitCheckout(config.source, manifest.version, cacheRoot)
    registry = resolve(repoDir, config.registry ?? 'dist')
  } else {
    registry = resolve(root, config.source)
  }
  const { dir, release } = loadRelease(registry, manifest.version)
  const problem = verifyRelease(dir, release)
  if (problem !== null) throw new Error(problem)
  return { dir, release }
}

/**
 * Problems with the running tool against the manifest pin.
 *
 * @returns {string[]}
 */
export function toolPinProblems(manifest) {
  const problems = []
  if (manifest.tool === undefined) return problems
  if (manifest.tool.version !== toolVersion()) problems.push('tool version ' + toolVersion() + ' does not match pinned ' + manifest.tool.version)
  const running = toolCommit()
  if (manifest.tool.commit !== undefined && running !== undefined && manifest.tool.commit !== running) {
    problems.push('tool commit ' + running + ' does not match pinned ' + manifest.tool.commit)
  }
  return problems
}

/**
 * Problems with the lock against the declared pin.
 *
 * The lock records the pin, not wherever the tool happened to be run from, so a
 * lock naming another commit is stale evidence even while the running tool is
 * the pinned one. A sync rewrites it from the declared pin.
 *
 * @returns {string[]}
 */
export function lockPinProblems(manifest) {
  const declared = manifest.tool?.commit
  const locked = manifest.lock?.tool?.commit
  if (declared === undefined || locked === undefined || declared === locked) return []
  return ['lock tool commit ' + locked + ' does not match pinned ' + declared + '; run harness sync']
}

/**
 * Problems with the running tool's file hashes against the lock.
 *
 * @returns {string[]}
 */
export function toolFileProblems(manifest) {
  const problems = []
  const locked = manifest.lock?.tool?.files
  if (locked === undefined) return problems
  const actual = toolFiles()
  for (const [rel, hash] of Object.entries(locked)) {
    if (actual[rel] !== hash) problems.push('tool file ' + rel + ': hash mismatch against the lock')
  }
  return problems
}

export function composedOutputs(root, manifest, baseDir) {
  return manifest.compositions.map((composition) => {
    const text = composeText(root, composition.sources, baseDir)
    return { output: composition.output, path: resolve(root, composition.output), text, hash: sha256(text) }
  })
}

/**
 * Inspect one consumer: ok, stale, diverged, or error. Shared by check and scan.
 *
 * @returns {{ status: string, detail: string }}
 */
export function inspect(root, manifest) {
  const locked = manifest.lock
  if (locked === undefined || locked.version !== manifest.version) return { status: 'stale', detail: 'lock missing or pinned to another version' }
  const pin = toolPinProblems(manifest)
  if (pin.length > 0) return { status: 'stale', detail: pin[0] }
  const lockPin = lockPinProblems(manifest)
  if (lockPin.length > 0) return { status: 'diverged', detail: lockPin[0] }
  const files = toolFileProblems(manifest)
  if (files.length > 0) return { status: 'diverged', detail: files[0] }
  const bootstrapPath = resolve(root, 'harness')
  if (!existsSync(bootstrapPath)) return { status: 'diverged', detail: 'harness: bootstrap missing; run harness sync' }
  if (readFileSync(bootstrapPath, 'utf8') !== SHIM) return { status: 'diverged', detail: 'harness: bootstrap is stale; run harness sync' }
  let base
  try {
    base = resolveBase(root, manifest)
  } catch (error) {
    return { status: 'error', detail: error.message }
  }
  if (base !== null) {
    if (locked.base === undefined) return { status: 'stale', detail: 'lock has no base pin' }
    if (locked.base.version !== base.release.version) return { status: 'stale', detail: 'base lock ' + locked.base.version + ' != ' + base.release.version }
    for (const [rel, hash] of Object.entries(base.release.files)) {
      if (locked.base.files?.[rel] !== hash) return { status: 'diverged', detail: 'base file ' + rel + ' differs from the lock' }
    }
  }
  const requirements = base === null ? undefined : loadRequirements(base.dir)
  const adoption = adoptionProblems(manifest, requirements).problems
  if (adoption.length > 0) return { status: 'stale', detail: adoption[0] }
  let outputs
  try {
    outputs = composedOutputs(root, manifest, base === null ? undefined : base.dir)
  } catch (error) {
    return { status: 'error', detail: error.message }
  }
  for (const item of outputs) {
    if (!existsSync(item.path)) return { status: 'diverged', detail: item.output + ': missing' }
    if (readFileSync(item.path, 'utf8') !== item.text) return { status: 'diverged', detail: item.output + ': drift' }
    const outLock = locked.outputs?.[item.output]
    if (outLock === undefined) return { status: 'stale', detail: item.output + ': no lock hash' }
    if (outLock !== item.hash) return { status: 'diverged', detail: item.output + ': lock hash mismatch' }
  }
  return { status: 'ok', detail: manifest.compositions.length + ' composition(s) match ' + manifest.version }
}

/**
 * Compose, verify, and commit a sync. Nothing is written until every source
 * resolves and composes; each file is written to a temp path and renamed.
 *
 * @returns {{ output: string, path: string, text: string, hash: string }[]}
 */
export function applySync(root, path, manifest) {
  const base = resolveBase(root, manifest)
  const pin = toolPinProblems(manifest)
  if (pin.length > 0) throw new Error(pin[0])
  const toolProblem = toolFileProblems(manifest)[0]
  if (toolProblem !== undefined) throw new Error(toolProblem + '; run harness upgrade')
  if (base !== null && manifest.lock?.base !== undefined) {
    const locked = manifest.lock.base
    if (locked.version !== base.release.version) throw new Error('base version ' + base.release.version + ' does not match pinned lock ' + locked.version + '; run harness upgrade')
    for (const [rel, hash] of Object.entries(base.release.files)) {
      if (locked.files?.[rel] !== hash) throw new Error('base file ' + rel + ' differs from the lock; run harness upgrade or restore base@' + base.release.version)
    }
  }
  const outputs = composedOutputs(root, manifest, base === null ? undefined : base.dir)
  const lock = { version: manifest.version, tool: { version: toolVersion(), files: toolFiles() }, outputs: {} }
  // The lock records the pin: a declared commit is what the repository pinned,
  // and the running checkout only supplies it when the manifest declares none.
  const commit = manifest.tool?.commit ?? toolCommit()
  if (commit !== undefined) lock.tool.commit = commit
  for (const item of outputs) {
    mkdirSync(dirname(item.path), { recursive: true })
    writeAtomic(item.path, item.text)
    lock.outputs[item.output] = item.hash
  }
  const bootstrapPath = resolve(root, 'harness')
  writeAtomic(bootstrapPath, SHIM)
  chmodSync(bootstrapPath, 0o755)
  if (base !== null) lock.base = { version: base.release.version, files: base.release.files }
  // A recorded proof is a fact about a gate, not about this composition, and a
  // declared pack is a fact about the repository, not about this composition: a
  // sync preserves both. They are appended after `base` so the lock keeps one
  // key order and a sync that changes nothing leaves the file byte-identical.
  if (manifest.lock?.packs !== undefined) lock.packs = manifest.lock.packs
  if (manifest.lock?.overrides !== undefined) lock.overrides = manifest.lock.overrides
  if (manifest.lock?.proofs !== undefined) lock.proofs = manifest.lock.proofs
  manifest.lock = lock
  // A merged manifest carries pack contributions in memory; the repository's
  // own file receives only the lock, never a materialized pack gate.
  const persisted = manifest[PACK_RAW] ?? manifest
  persisted.lock = lock
  writeAtomic(path, JSON.stringify(persisted, null, 2) + '\n')
  return outputs
}
