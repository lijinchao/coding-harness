import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { surveyRepository } from '../src/survey.mjs'

const CLI = resolve(import.meta.dirname, '../bin/harness.mjs')

function gitRepo(dir) {
  const options = { cwd: dir, stdio: 'pipe' }
  execFileSync('git', ['init', '-q'], options)
  execFileSync('git', ['add', '-A'], options)
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'init'], options)
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'coding-harness-survey-'))
  mkdirSync(join(root, '.github', 'workflows'), { recursive: true })
  mkdirSync(join(root, 'docs', 'contracts'), { recursive: true })
  mkdirSync(join(root, 'scripts'), { recursive: true })
  writeFileSync(join(root, '.github', 'CODEOWNERS'), '* @owner\n')
  writeFileSync(join(root, '.github', 'workflows', 'check.yml'), 'jobs: {}\n')
  writeFileSync(join(root, 'AGENTS.md'), '# Agent entry\n')
  writeFileSync(join(root, 'ARCHITECTURE.md'), '# Architecture\n')
  writeFileSync(join(root, 'docs', 'contracts', 'api.md'), '# Contract\n')
  writeFileSync(join(root, 'scripts', 'run_network_gate.py'), 'import urllib.request\n')
  writeFileSync(join(root, 'package.json'), JSON.stringify({
    scripts: {
      test: 'node --test',
      gates: 'python scripts/run_*_gate.py',
      dangerous: 'npm publish',
    },
  }))
  gitRepo(root)
  return root
}

test('survey reports an unadopted repository without declaring it healthy', () => {
  const root = fixture()
  const report = surveyRepository(root)
  assert.equal(report.integration.status, 'not-adopted')
  assert.equal(report.integration.ready, false)
  assert.equal(report.qualification.status, 'unavailable')
  assert.equal(report.qualification.reason, 'project manifest is missing')
  assert.deepEqual(report.agent_entrypoints, ['AGENTS.md'])
  assert.deepEqual(report.governance.ci, ['.github/workflows/check.yml'])
  assert.deepEqual(report.governance.codeowners, ['.github/CODEOWNERS'])
  assert.equal(report.context.architecture.count, 1)
  assert.equal(report.context.contracts.count, 1)
  assert.equal(report.repository.working_tree.clean, true)
  assert.equal(report.repository.worktrees.length, 1)
  rmSync(root, { recursive: true, force: true })
})

test('survey distinguishes a foreign Harness contract whose runtime is missing', () => {
  const root = fixture()
  mkdirSync(join(root, '.coding-harness'), { recursive: true })
  writeFileSync(join(root, '.coding-harness', 'project.json'), JSON.stringify({
    schema_version: 1,
    harness: { mode: 'shadow', version: '0.25.0' },
  }))
  execFileSync('git', ['add', '.coding-harness/project.json'], { cwd: root })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'foreign harness'], { cwd: root })

  const report = surveyRepository(root)

  assert.equal(report.integration.status, 'foreign-integration-detected')
  assert.equal(report.integration.ready, false)
  assert.deepEqual(report.integration.foreign, {
    contract: 'ai-native-harness-kit-project',
    markers: ['.coding-harness/project.json'],
    project_manifest: '.coding-harness/project.json',
    version: '0.25.0',
    executable: 'coding-harness',
    executable_resolvable: false,
  })
  assert.match(report.integration.next, /restore the coding-harness runtime or review migration/)
  assert.equal(report.qualification.status, 'unavailable')
  assert.equal(report.qualification.reason, 'foreign Harness executable is not resolvable: coding-harness')
  rmSync(root, { recursive: true, force: true })
})

test('survey resolves but never executes a foreign Harness runtime', () => {
  const root = fixture()
  const bin = mkdtempSync(join(tmpdir(), 'coding-harness-survey-bin-'))
  const marker = join(root, 'foreign-runtime-executed')
  mkdirSync(join(root, '.coding-harness'), { recursive: true })
  writeFileSync(join(root, '.coding-harness', 'project.json'), JSON.stringify({
    schema_version: 1,
    harness: { mode: 'shadow', version: '0.25.0' },
  }))
  writeFileSync(join(bin, 'coding-harness'), `#!/bin/sh\ntouch ${marker}\n`)
  chmodSync(join(bin, 'coding-harness'), 0o755)
  execFileSync('git', ['add', '.coding-harness/project.json'], { cwd: root })
  execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'foreign harness'], { cwd: root })

  const output = execFileSync(process.execPath, [CLI, 'survey', '--dir', root], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  })
  const report = JSON.parse(output)

  assert.equal(report.integration.status, 'foreign-integration-detected')
  assert.equal(report.integration.foreign.executable_resolvable, true)
  assert.equal(report.verification.executed, false)
  assert.equal(existsSync(marker), false)
  rmSync(root, { recursive: true, force: true })
  rmSync(bin, { recursive: true, force: true })
})

test('survey does not parse an untracked foreign Harness marker', () => {
  const root = fixture()
  mkdirSync(join(root, '.coding-harness'), { recursive: true })
  writeFileSync(join(root, '.coding-harness', 'project.json'), '{not json')

  const report = surveyRepository(root)

  assert.equal(report.integration.status, 'not-adopted')
  assert.equal(report.integration.foreign, undefined)
  assert.equal(report.qualification.reason, 'project manifest is missing')
  rmSync(root, { recursive: true, force: true })
})

test('survey exposes candidate command risk without executing a command', () => {
  const root = fixture()
  const marker = join(root, 'executed')
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  pkg.scripts.test = `touch ${marker}`
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg))
  const before = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  const report = surveyRepository(root)
  const after = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
  assert.equal(existsSync(marker), false)
  assert.equal(after, before)
  assert.equal(report.verification.safe_default_count, 0)
  assert.ok(report.verification.candidates.find((item) => item.id === 'package:gates').issues.includes('wildcards-are-not-executable-command-arguments'))
  assert.ok(report.verification.candidates.find((item) => item.id === 'package:dangerous').risk_signals.includes('high-impact'))
  const networkGate = report.verification.candidates.find((item) => item.id === 'script:scripts/run_network_gate.py')
  assert.ok(networkGate.risk_signals.includes('external-service'))
  assert.ok(!networkGate.issues.includes('wildcards-are-not-executable-command-arguments'))
  rmSync(root, { recursive: true, force: true })
})

test('survey CLI emits stable JSON and accepts a path inside the repository', () => {
  const root = fixture()
  const output = execFileSync(process.execPath, [CLI, 'survey', '--dir', join(root, 'docs')], { encoding: 'utf8' })
  const report = JSON.parse(output)
  assert.equal(report.schema_version, 'coding-harness.survey/v1')
  assert.equal(report.repository.root, realpathSync(root))
  assert.equal(report.verification.executed, false)
  rmSync(root, { recursive: true, force: true })
})

test('survey reports an external repository once and carries missing references', () => {
  const parent = mkdtempSync(join(tmpdir(), 'coding-harness-survey-system-'))
  const root = join(parent, 'control')
  const sibling = join(parent, 'runtime')
  mkdirSync(root)
  mkdirSync(sibling)
  writeFileSync(join(sibling, 'main.py'), '')
  gitRepo(sibling)
  writeFileSync(join(root, 'ARCHITECTURE.md'), `# Architecture\n\n- ${sibling}\n- ${sibling}/missing.py\n- /private/tmp/old-report.json\n`)
  gitRepo(root)
  const report = surveyRepository(root)
  assert.deepEqual(report.external_repositories, [{
    path: realpathSync(sibling),
    exists: true,
    sources: ['ARCHITECTURE.md'],
    missing_references: [`${sibling}/missing.py`],
  }])
  rmSync(parent, { recursive: true, force: true })
})
