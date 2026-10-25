import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

// Every invocation owns its receipt. The expected command is a tracked fixture
// so failure injection changes the assertion, not another process's files.
const root = resolve(import.meta.dirname, '..')
const temporary = mkdtempSync(join(tmpdir(), 'harness-command-review-gate-'))
try {
  const revision = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  const out = join(temporary, 'receipt.json')
  const cli = join(root, 'bin/harness.mjs')
  execFileSync(process.execPath, [cli, 'command-review', '--repository', root, '--revision', revision, '--command', 'true', '--out', out], { stdio: 'pipe' })
  const fixture = JSON.parse(readFileSync(join(root, 'docs/fixtures/command-review.json'), 'utf8'))
  const result = JSON.parse(execFileSync(process.execPath, [cli, 'command-review-check', '--repository', root, '--revision', revision, '--command', fixture.command, '--receipt', out], { encoding: 'utf8', stdio: 'pipe' }))
  if (result.valid !== true || result.passed_without_tree_changes !== true || result.authorizes_verification !== false) throw new Error('command-review receipt did not satisfy its contract')
  console.log('command-review: valid receipt; no verification authority granted')
} catch (error) {
  console.error('command-review: ' + error.message)
  process.exitCode = 1
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
