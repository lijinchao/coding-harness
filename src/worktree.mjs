import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

/** Ignored state a proof usually needs: the tool cache and installed packages. */
const DEFAULT_CARRY = ['.harness', 'node_modules']

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
      symlinkSync(source, target)
      links.push(rel)
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
