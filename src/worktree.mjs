import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** Ignored state a proof usually needs: the tool cache and installed packages. */
export const DEFAULT_CARRY = ['.harness', 'node_modules']

/**
 * Record the files under carried paths with the metadata a mutation changes.
 *
 * `.git` directories are skipped: a proof that rewrote a fetched tool's object
 * store already fails the commit check the shim performs, and walking every
 * object of every cached clone costs seconds where this walk costs a fraction
 * of one.
 *
 * @param {string} root - Repository root.
 * @param {string[]} paths - Repository-relative carried paths.
 * @returns {Record<string, string>} Size and modification time per file.
 */
export function carriedState(root, paths) {
  const state = {}
  const walk = (dir, prefix) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name === '.git') continue
      const path = join(dir, entry.name)
      const key = prefix + '/' + entry.name
      if (entry.isDirectory()) {
        walk(path, key)
        continue
      }
      if (!entry.isFile()) continue
      try {
        const info = statSync(path)
        state[key] = info.size + ':' + info.mtimeMs
      } catch {
        // A file that vanished mid-walk is reported as removed by the diff.
      }
    }
  }
  for (const rel of paths) {
    const source = resolve(root, rel)
    if (!existsSync(source)) continue
    const before = state
    if (statSync(source).isDirectory()) walk(source, rel)
    else {
      try {
        const info = statSync(source)
        before[rel] = info.size + ':' + info.mtimeMs
      } catch {
        // Same as above.
      }
    }
  }
  return state
}

/**
 * What changed between two carried states.
 *
 * @param {Record<string, string>} before - The state before the proof.
 * @param {Record<string, string>} after - The state after the proof.
 * @returns {{ modified: string[], removed: string[], added: string[] }}
 */
export function carriedChanges(before, after) {
  const modified = []
  const removed = []
  const added = []
  for (const [path, value] of Object.entries(before)) {
    if (!(path in after)) removed.push(path)
    else if (after[path] !== value) modified.push(path)
  }
  for (const path of Object.keys(after)) if (!(path in before)) added.push(path)
  return { modified: modified.sort(), removed: removed.sort(), added: added.sort() }
}

/**
 * Link one carried path into the worktree.
 *
 * A directory is materialized as a real directory of symlinked entries instead
 * of a symlinked directory: a gitignore rule such as `node_modules/` matches a
 * directory, not a symlink, so a linked directory would surface as an untracked
 * file to a gate that lists them, while the entries of a real ignored directory
 * stay invisible.
 *
 * @param {string} source - Path in the real repository.
 * @param {string} target - Path in the worktree.
 * @returns {string[]} Repository-relative entries that were linked.
 */
function linkCarried(source, target) {
  if (!statSync(source).isDirectory()) {
    symlinkSync(source, target)
    return ['']
  }
  mkdirSync(target, { recursive: true })
  const linked = []
  for (const entry of readdirSync(source)) {
    try {
      symlinkSync(resolve(source, entry), resolve(target, entry))
      linked.push(entry)
    } catch {
      // An entry that cannot be linked is simply not carried.
    }
  }
  return linked
}

/**
 * Create a detached worktree of HEAD for an isolated proof, carrying over the
 * ignored state a gate command may need.
 *
 * The worktree lives outside the repository, so a proof that introduces a
 * failure cannot be observed by another process reading the real tree.
 *
 * @param {string} root - Repository root.
 * @param {string[]} [carry] - Extra repository-relative paths to link in.
 * @returns {{ dir: string, links: string[] }}
 */
export function createProofWorktree(root, carry = []) {
  const dir = mkdtempSync(join(tmpdir(), 'coding-harness-prove-'))
  execFileSync('git', ['-C', root, 'worktree', 'add', '--detach', dir, 'HEAD'], { stdio: 'pipe' })
  const links = []
  for (const rel of [...DEFAULT_CARRY, ...carry]) {
    const source = resolve(root, rel)
    const target = resolve(dir, rel)
    if (!existsSync(source) || existsSync(target)) continue
    try {
      for (const entry of linkCarried(source, target)) links.push(entry === '' ? rel : join(rel, entry))
    } catch {
      // A path that cannot be linked is simply not carried.
    }
  }
  return { dir, links }
}

/**
 * Remove a proof worktree and prune its metadata, always succeeding.
 *
 * @param {string} root - Repository root.
 * @param {string} dir - Worktree directory.
 */
export function removeProofWorktree(root, dir) {
  try {
    execFileSync('git', ['-C', root, 'worktree', 'remove', '--force', dir], { stdio: 'pipe' })
  } catch {
    // A worktree that is already gone needs no removal.
  }
  try {
    execFileSync('git', ['-C', root, 'worktree', 'prune'], { stdio: 'pipe' })
  } catch {
    // Pruning is best effort.
  }
  rmSync(dir, { recursive: true, force: true })
}
