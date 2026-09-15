import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  COMMAND_REVIEW_FILESYSTEM_KEYS,
  COMMAND_REVIEW_ISOLATION_KEYS,
  COMMAND_REVIEW_KEYS,
  COMMAND_REVIEW_OBSERVABILITY_KEYS,
  COMMAND_REVIEW_REPOSITORY_KEYS,
  COMMAND_REVIEW_RESULT_KEYS,
  COMMAND_REVIEW_STREAM_KEYS,
  checkCommandReview,
  runCommandReview,
  validateCommandReview,
} from '../src/command-review.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')
const SCHEMA = JSON.parse(readFileSync(resolve(import.meta.dirname, '../schema/command-review.schema.json'), 'utf8'))

function repositoryFixture() {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-command-review-fixture-'))
  const repository = join(root, 'repository')
  execFileSync('mkdir', ['-p', repository])
  writeFileSync(join(repository, 'check.mjs'), "console.log('committed candidate')\n")
  execFileSync('git', ['init', '-q'], { cwd: repository })
  execFileSync('git', ['add', '-A'], { cwd: repository })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'fixture'], { cwd: repository })
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repository, encoding: 'utf8' }).trim()
  return { root, repository, revision }
}

test('command review runs the exact revision in an archive and does not authorize admission', async () => {
  const value = repositoryFixture()
  writeFileSync(join(value.repository, 'check.mjs'), "throw new Error('dirty source must not run')\n")
  writeFileSync(join(value.repository, 'untracked.txt'), 'not exported\n')
  const out = join(value.root, 'review.json')
  const beforeTemps = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('coding-harness-command-review-')))
  const receipt = await runCommandReview(value.repository, value.revision, 'node check.mjs', out, { timeoutMs: 5000 })
  const afterTemps = new Set(readdirSync(tmpdir()).filter((name) => name.startsWith('coding-harness-command-review-')))

  assert.equal(receipt.status, 'passed')
  assert.equal(receipt.result.ok, true)
  assert.equal(receipt.authorizes_verification, false)
  assert.equal(receipt.observability.external_execution_allowed, false)
  assert.equal(receipt.isolation.mode, 'git-archive')
  assert.equal(receipt.isolation.temporary_directory_removed, true)
  assert.deepEqual(receipt.filesystem.added, [])
  assert.deepEqual(receipt.filesystem.modified, [])
  assert.deepEqual(receipt.filesystem.removed, [])
  assert.equal(receipt.filesystem.before_sha256, receipt.filesystem.after_sha256)
  assert.deepEqual(afterTemps, beforeTemps)
  assert.deepEqual(validateCommandReview(receipt), [])
  const checked = checkCommandReview(value.repository, value.revision, 'node check.mjs', out)
  assert.equal(checked.valid, true)
  assert.equal(checked.passed_without_tree_changes, true)
  assert.equal(checked.authorizes_verification, false)
  rmSync(value.root, { recursive: true, force: true })
})

test('command review reports isolated tree mutations and failing commands', async () => {
  const value = repositoryFixture()
  const mutatedOut = join(value.root, 'mutated.json')
  const mutated = await runCommandReview(
    value.repository,
    value.revision,
    `node -e "require('fs').writeFileSync('made.txt','x')"`,
    mutatedOut,
    { timeoutMs: 5000 },
  )
  assert.equal(mutated.status, 'mutated')
  assert.equal(mutated.result.ok, true)
  assert.deepEqual(mutated.filesystem.added, ['made.txt'])
  assert.equal(checkCommandReview(value.repository, value.revision, mutated.command, mutatedOut).valid, true)

  const failedOut = join(value.root, 'failed.json')
  const failed = await runCommandReview(value.repository, value.revision, 'node -e "process.exit(7)"', failedOut, { timeoutMs: 5000 })
  assert.equal(failed.status, 'failed')
  assert.equal(failed.result.exit_code, 7)
  assert.equal(checkCommandReview(value.repository, value.revision, failed.command, failedOut).valid, true)
  rmSync(value.root, { recursive: true, force: true })
})

test('command review records timeout and leaves no temporary archive', async () => {
  const value = repositoryFixture()
  const out = join(value.root, 'timeout.json')
  const receipt = await runCommandReview(value.repository, value.revision, 'node -e "setInterval(() => {}, 1000)"', out, { timeoutMs: 20 })
  assert.equal(receipt.status, 'failed')
  assert.equal(receipt.result.timed_out, true)
  assert.equal(receipt.isolation.temporary_directory_removed, true)
  assert.equal(existsSync(out), true)
  rmSync(value.root, { recursive: true, force: true })
})

test('command review refuses unsafe declaration and receipt overwrite by default', async () => {
  const value = repositoryFixture()
  const out = join(value.root, 'review.json')
  await assert.rejects(runCommandReview(value.repository, value.revision, 'curl https://example.test', out), /external-service signal/)
  await assert.rejects(runCommandReview(value.repository, value.revision, 'node *.mjs', out), /wildcard/)
  await assert.rejects(runCommandReview(value.repository, value.revision, 'node check.mjs', join(value.repository, 'review.json')), /outside the source repository/)
  await runCommandReview(value.repository, value.revision, 'node check.mjs', out)
  await assert.rejects(runCommandReview(value.repository, value.revision, 'node check.mjs', out), /already exists/)
  const explicitOut = join(value.root, 'external-authority.json')
  const explicit = await runCommandReview(value.repository, value.revision, `node -e "console.log('provider')"`, explicitOut, { allowExternal: true })
  assert.equal(explicit.observability.external_execution_allowed, true)
  rmSync(value.root, { recursive: true, force: true })
})

test('command review check detects command, revision, and authorization tampering', async () => {
  const value = repositoryFixture()
  const out = join(value.root, 'review.json')
  const receipt = await runCommandReview(value.repository, value.revision, 'node check.mjs', out)
  assert.equal(checkCommandReview(value.repository, value.revision, 'node changed.mjs', out).valid, false)
  receipt.authorizes_verification = true
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n')
  const tampered = checkCommandReview(value.repository, value.revision, 'node check.mjs', out)
  assert.equal(tampered.valid, false)
  assert.match(tampered.problems.join('\n'), /authorizes_verification: must be false/)
  receipt.authorizes_verification = false
  receipt.filesystem.added = ['invented.txt']
  receipt.status = 'failed'
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n')
  assert.match(checkCommandReview(value.repository, value.revision, 'node check.mjs', out).problems.join('\n'), /changes require mutated/)
  const missing = checkCommandReview(value.repository, '0'.repeat(40), 'node check.mjs', out)
  assert.equal(missing.valid, false)
  assert.match(missing.problems.join('\n'), /revision/)
  rmSync(value.root, { recursive: true, force: true })
})

test('command review schema and executable validator expose the same fields', () => {
  assert.deepEqual([...COMMAND_REVIEW_KEYS].sort(), Object.keys(SCHEMA.properties).sort())
  assert.deepEqual([...COMMAND_REVIEW_REPOSITORY_KEYS].sort(), Object.keys(SCHEMA.properties.repository.properties).sort())
  assert.deepEqual([...COMMAND_REVIEW_ISOLATION_KEYS].sort(), Object.keys(SCHEMA.properties.isolation.properties).sort())
  assert.deepEqual([...COMMAND_REVIEW_RESULT_KEYS].sort(), Object.keys(SCHEMA.properties.result.properties).sort())
  assert.deepEqual([...COMMAND_REVIEW_FILESYSTEM_KEYS].sort(), Object.keys(SCHEMA.properties.filesystem.properties).sort())
  assert.deepEqual([...COMMAND_REVIEW_OBSERVABILITY_KEYS].sort(), Object.keys(SCHEMA.properties.observability.properties).sort())
  assert.deepEqual([...COMMAND_REVIEW_STREAM_KEYS].sort(), Object.keys(SCHEMA.definitions.stream.properties).sort())
  assert.deepEqual([...COMMAND_REVIEW_KEYS].sort(), [...SCHEMA.required].sort())
  assert.deepEqual([...COMMAND_REVIEW_REPOSITORY_KEYS].sort(), [...SCHEMA.properties.repository.required].sort())
  assert.deepEqual([...COMMAND_REVIEW_ISOLATION_KEYS].sort(), [...SCHEMA.properties.isolation.required].sort())
  assert.deepEqual([...COMMAND_REVIEW_RESULT_KEYS].sort(), [...SCHEMA.properties.result.required].sort())
  assert.deepEqual([...COMMAND_REVIEW_FILESYSTEM_KEYS].sort(), [...SCHEMA.properties.filesystem.required].sort())
  assert.deepEqual([...COMMAND_REVIEW_OBSERVABILITY_KEYS].sort(), [...SCHEMA.properties.observability.required].sort())
  assert.deepEqual([...COMMAND_REVIEW_STREAM_KEYS].sort(), [...SCHEMA.definitions.stream.required].sort())
})

test('command review and check work through the CLI', () => {
  const value = repositoryFixture()
  const out = join(value.root, 'review.json')
  const run = spawnSync(process.execPath, [CLI, 'command-review', '--repository', value.repository, '--revision', value.revision, '--command', 'node check.mjs', '--out', out, '--timeout', '5'], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  assert.equal(JSON.parse(run.stdout).authorizes_verification, false)
  const check = spawnSync(process.execPath, [CLI, 'command-review-check', '--repository', value.repository, '--revision', value.revision, '--command', 'node check.mjs', '--receipt', out], { encoding: 'utf8' })
  assert.equal(check.status, 0, check.stderr)
  assert.equal(JSON.parse(check.stdout).valid, true)
  rmSync(value.root, { recursive: true, force: true })
})
