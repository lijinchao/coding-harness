import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import pathApi, { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCHEMA = JSON.parse(readFileSync(new URL('./delivery.schema.json', import.meta.url), 'utf8'))
const LEGACY_SCHEMA = JSON.parse(readFileSync(new URL('./delivery-v1.schema.json', import.meta.url), 'utf8'))
const TIERS = ['unit', 'integration', 'e2e']
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Interpret only the JSON Schema keywords used by this pack's closed schema. */
function validate(value, schema, where, problems, ownProperties = false) {
  const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  if (schema.type && type !== schema.type) { problems.push(where + ': expected ' + schema.type); return }
  if (schema.enum && !schema.enum.includes(value)) problems.push(where + ': unsupported value')
  if (typeof value === 'string') {
    if (schema.minLength && value.trim().length < schema.minLength) problems.push(where + ': required non-empty string')
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) problems.push(where + ': invalid value')
  }
  if (Array.isArray(value)) {
    if (schema.minItems && value.length < schema.minItems) problems.push(where + ': required non-empty array')
    value.forEach((entry, i) => validate(entry, schema.items, where + '[' + i + ']', problems, ownProperties))
  }
  if (object(value)) {
    for (const key of schema.required ?? []) if (!(key in value)) problems.push(where + '.' + key + ': required')
    for (const [key, entry] of Object.entries(value)) {
      const properties = schema.properties ?? {}
      const rule = ownProperties && !Object.hasOwn(properties, key) ? undefined : properties[key]
      if (rule) validate(entry, rule, where + '.' + key, problems, ownProperties)
      else if (schema.additionalProperties === false) problems.push(where + '.' + key + ': unknown field')
    }
  }
}

export function inside(root, path, paths = pathApi) {
  const rel = paths.relative(root, path)
  return rel !== '..' && !rel.startsWith('..' + paths.sep) && !paths.isAbsolute(rel)
}

function localPath(root, path) {
  if (isAbsolute(path) || path.split(/[\\/]/).includes('..') || /[*?[\]]/.test(path)) throw new Error('path must stay inside repository: ' + path)
  const full = resolve(root, path)
  if (!inside(realpathSync(root), realpathSync(full))) throw new Error('symlink escapes repository: ' + path)
  return full
}

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
}

/** Explicit project-owned markers; examples inside fenced code are not scenarios. */
export function scenarioIds(text) {
  let fence = null
  const prose = []
  for (const line of text.split('\n')) {
    if (fence) {
      if (new RegExp('^ {0,3}' + fence.char + '{' + fence.length + ',}\\s*$').test(line)) fence = null
      continue
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/)
    if (opening) { fence = { char: opening[1][0], length: opening[1].length }; continue }
    prose.push(line)
  }
  return [...prose.join('\n').matchAll(/<!--\s*scenario:\s*([A-Za-z][A-Za-z0-9_-]*)\s*-->/g)].map(match => match[1])
}

function inScope(path, scope) {
  return scope.some(item => path === item || path.startsWith(item.replace(/\/$/, '') + '/'))
}

function trackedRegular(root, path, kind) {
  if (typeof path !== 'string' || path.includes('\\') || pathApi.posix.normalize(path) !== path) throw new Error(kind + ': noncanonical repository path')
  const file = localPath(root, path)
  if (!lstatSync(file).isFile()) throw new Error(kind + ': expected tracked regular file, not symlink')
  try {
    const tracked = git(root, 'ls-files', '--stage', '-z', '--', path).toString().split('\0')
    const entry = tracked.find(item => item.slice(item.indexOf('\t') + 1) === path)
    if (!entry) throw new Error('not indexed')
    const fields = entry.slice(0, entry.indexOf('\t')).split(' ')
    if (!['100644', '100755'].includes(fields[0]) || fields[2] !== '0') throw new Error('index is not regular')
  } catch { throw new Error(kind + ': file must be a tracked regular index entry: ' + path) }
  return readFileSync(file)
}

function inspectBehavior(root, manifestPath, plan, report) {
  const planPath = pathApi.relative(root, resolve(manifestPath)).split(pathApi.sep).join('/')
  trackedRegular(root, planPath, 'plan')
  const bytes = trackedRegular(root, plan.design, 'behavior/design')
  if (!inScope(planPath, plan.scope)) report.problems.push('plan must be inside declared scope')
  if (!inScope(plan.design, plan.scope)) report.problems.push('behavior/design must be inside declared scope')
  const ids = scenarioIds(bytes.toString('utf8')), seen = new Set()
  for (const id of ids) {
    if (seen.has(id)) report.problems.push('duplicate scenario marker: ' + id)
    seen.add(id)
  }
  for (const criterion of plan.acceptance) if (!seen.has(criterion.scenario)) report.problems.push('scenario not found: ' + criterion.scenario)
  report.plan_path = planPath
  report.behavior = { path: plan.design, revision: null, sha256: hash(bytes), scenarios: [...seen] }
}

function inspectTiers(plan, report) {
  const seen = new Set()
  for (const declaration of plan.tiers) {
    const { tier, status, reason, follow_up } = declaration
    if (seen.has(tier)) report.problems.push('duplicate tier: ' + tier)
    seen.add(tier)
    const checks = plan.checks.filter(check => check.tier === tier).map(check => check.id)
    if (status === 'covered' && checks.length === 0) report.problems.push(tier + ': covered requires a check')
    if (status === 'not_applicable' && checks.length > 0) report.problems.push(tier + ': not_applicable contradicts declared checks')
    if (['blocked', 'not_evaluated'].includes(status) && !follow_up?.trim()) report.problems.push(tier + ': ' + status + ' requires follow_up')
    report.tiers.push({ tier, declared_status: status, status: status === 'covered' ? 'not_evaluated' : status, reason, ...(follow_up ? { follow_up } : {}), checks })
  }
  for (const tier of TIERS) if (!seen.has(tier)) report.problems.push('missing tier: ' + tier)
}

function bindCandidate(root, plan, bytes, revision, report) {
  const prefix = git(root, 'rev-parse', '--show-prefix').toString().replace(/\r?\n$/, '')
  for (const [kind, path] of [['plan', report.plan_path], ['behavior', plan.design]]) {
    const mode = git(root, 'ls-tree', '-z', revision, '--', path).toString().split(' ')[0]
    if (!['100644', '100755'].includes(mode)) throw new Error(kind + ': candidate must contain a regular tracked file')
  }
  const heldPlan = git(root, 'show', revision + ':' + prefix + report.plan_path)
  if (hash(heldPlan) !== hash(bytes)) throw new Error('plan bytes differ from candidate revision')
  const heldBehavior = git(root, 'show', revision + ':' + prefix + plan.design)
  if (hash(heldBehavior) !== report.behavior.sha256) throw new Error('behavior bytes differ from candidate revision')
  report.behavior.revision = revision
}

function readReceipt(root, check, phase, options) {
  const file = resolve(options.receipts, check.id + '.' + phase + '.json')
  const receipt = JSON.parse(readFileSync(file, 'utf8'))
  const args = ['command-review-check', '--repository', root, '--revision', receipt.repository?.revision ?? '', '--command', check.command, '--receipt', file]
  const bound = JSON.parse(execFileSync(options.harness ?? resolve(root, 'harness'), args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }))
  if (bound.valid !== true || receipt.authorizes_verification !== false) throw new Error(check.id + ': invalid ' + phase + ' receipt')
  if (receipt.result?.timed_out || receipt.result?.signal !== null) throw new Error(check.id + ': timeout or signal is not ' + phase + ' evidence')
  if (phase === 'green' && (receipt.repository.revision !== options.revision || bound.passed_without_tree_changes !== true)) throw new Error(check.id + ': green receipt must pass without mutation at candidate revision')
  if (phase === 'red' && (receipt.status !== 'failed' || receipt.result?.ok !== false || receipt.result?.exit_code === 0)) throw new Error(check.id + ': baseline receipt must fail')
  return receipt
}

/** Read a plan and existing evidence. No test, fixture, build, or model command runs. */
export function inspectDelivery(manifestPath, options = {}) {
  const stage = options.stage ?? 'planned'
  const report = {
    schema_version: 'coding-harness.delivery-report/v1', stage, status: 'blocked',
    plan_sha256: null, revision: options.revision ?? null, criteria: [], problems: [],
    human_decision: 'pending', reviewer_identity_authenticated: false, authorizes_merge: false,
  }
  try {
    if (!['planned', 'verified', 'accepted'].includes(stage)) throw new Error('unsupported stage: ' + stage)
    const bytes = readFileSync(manifestPath)
    report.plan_sha256 = hash(bytes)
    const plan = JSON.parse(bytes)
    const modern = plan.schema_version === 'coding-harness.delivery/v2'
    if (modern) {
      report.schema_version = 'coding-harness.delivery-report/v2'
      report.verification_complete = false
      report.tiers = []
    }
    validate(plan, modern ? SCHEMA : LEGACY_SCHEMA, 'plan', report.problems, modern)
    if (report.problems.length) return report
    const root = dirname(resolve(manifestPath))
    report.scope = plan.scope
    report.design = plan.design
    report.constraints = plan.constraints
    report.checks = plan.checks.map((check) => ({ id: check.id, tier: check.tier, command: check.command, test_files: check.test_files, evidence: 'pending' }))
    const checks = new Map()
    for (const entry of plan.checks) {
      if (checks.has(entry.id)) report.problems.push('duplicate check: ' + entry.id)
      checks.set(entry.id, entry)
      if (/\r|\n/.test(entry.command)) report.problems.push(entry.id + ': command must be one line')
      for (const path of entry.test_files) {
        if (!statSync(localPath(root, path)).isFile()) report.problems.push(path + ': test must be a file')
        if (!plan.scope.some((scope) => path === scope || path.startsWith(scope.replace(/\/$/, '') + '/'))) report.problems.push(path + ': test outside declared scope')
      }
    }
    const design = localPath(root, plan.design)
    if (!statSync(design).isFile() || statSync(design).size === 0) report.problems.push('design must be a non-empty file')
    for (const scope of plan.scope) localPath(root, scope)
    const ids = new Set()
    const used = new Set()
    for (const criterion of plan.acceptance) {
      if (ids.has(criterion.id)) report.problems.push('duplicate criterion: ' + criterion.id)
      ids.add(criterion.id)
      for (const id of criterion.checks) {
        if (!checks.has(id)) report.problems.push(criterion.id + ': unknown check ' + id)
        used.add(id)
      }
      report.criteria.push({ id: criterion.id, description: criterion.description, ...(modern ? { scenario: criterion.scenario } : {}), checks: criterion.checks, evidence: 'pending' })
    }
    for (const id of checks.keys()) if (!used.has(id)) report.problems.push('unmapped check: ' + id)
    if (modern) {
      inspectBehavior(root, manifestPath, plan, report)
      inspectTiers(plan, report)
    } else {
      const waived = new Set()
      for (const waiver of plan.tier_waivers) {
        if (waived.has(waiver.tier)) report.problems.push('duplicate tier waiver: ' + waiver.tier)
        waived.add(waiver.tier)
        if (plan.checks.some((check) => check.tier === waiver.tier)) report.problems.push('tier is both covered and waived: ' + waiver.tier)
      }
      for (const tier of TIERS) if (!waived.has(tier) && !plan.checks.some((check) => check.tier === tier)) report.problems.push('unaddressed test tier: ' + tier)
      report.tier_waivers = plan.tier_waivers
    }
    if (report.problems.length) return report
    if (stage !== 'planned') {
      if (modern) for (const tier of report.tiers) if (['blocked', 'not_evaluated'].includes(tier.declared_status)) report.problems.push(tier.tier + ': ' + tier.declared_status + '; follow_up: ' + tier.follow_up)
      if (report.problems.length) return report
      if (!/^[a-f0-9]{40}$/.test(options.revision ?? '')) throw new Error('verified stage requires a full candidate --revision and --receipts')
      if (modern) bindCandidate(root, plan, bytes, options.revision, report)
      if (!options.receipts) throw new Error('verified stage requires --receipts')
      const drift = git(root, 'diff', options.revision, '--', ...plan.scope).toString()
      const untracked = git(root, 'ls-files', '--others', '--exclude-standard', '--', ...plan.scope).toString()
      if (drift || untracked) throw new Error('candidate scope changed since evidence was recorded')
      for (const check of plan.checks) {
        const green = readReceipt(root, check, 'green', options)
        const red = readReceipt(root, check, 'red', options)
        git(root, 'merge-base', '--is-ancestor', red.repository.revision, green.repository.revision)
        if (red.repository.revision === green.repository.revision) throw new Error(check.id + ': baseline and candidate must differ')
        for (const path of check.test_files) {
          const before = git(root, 'show', red.repository.revision + ':' + path)
          const after = git(root, 'show', green.repository.revision + ':' + path)
          if (!before.equals(after)) throw new Error(check.id + ': test changed between red and green: ' + path)
        }
        let expectedFailure = false
        for (const stream of ['stdout', 'stderr']) {
          const diagnostic = resolve(options.receipts, check.id + '.red.' + stream + '.txt')
          if (!existsSync(diagnostic)) continue
          const content = readFileSync(diagnostic)
          if (hash(content) !== red.result[stream].sha256 || content.length !== red.result[stream].bytes) throw new Error(check.id + ': baseline diagnostic does not match receipt')
          if (typeof check.expected_failure === 'string' && content.toString().includes(check.expected_failure)) expectedFailure = true
        }
        if (!expectedFailure) throw new Error(check.id + ': expected failure diagnostic is missing')
        Object.assign(report.checks.find((entry) => entry.id === check.id), {
          evidence: 'verified', baseline_revision: red.repository.revision,
          candidate_revision: green.repository.revision,
          receipts: { red: resolve(options.receipts, check.id + '.red.json'), green: resolve(options.receipts, check.id + '.green.json') },
          frozen_tests: check.test_files.map((path) => ({ path, sha256: hash(git(root, 'show', green.repository.revision + ':' + path)) })),
        })
      }
      for (const criterion of report.criteria) criterion.evidence = 'verified'
      if (modern) {
        for (const tier of report.tiers) if (tier.declared_status === 'covered') tier.status = 'covered'
        report.verification_complete = true
      }
    }
    if (stage === 'accepted') {
      if (!options.approval) throw new Error('accepted stage requires a separately reviewed --approval file')
      const decision = JSON.parse(readFileSync(options.approval, 'utf8'))
      if (decision.decision !== 'accepted' || typeof decision.reviewed_by !== 'string' || !decision.reviewed_by.trim()
        || decision.revision !== options.revision || decision.plan_sha256 !== report.plan_sha256
        || typeof decision.evidence !== 'string' || !decision.evidence.trim()) throw new Error('approval must bind reviewer, review evidence, plan digest, and candidate revision')
      report.human_decision = 'declared-accepted'
      report.reviewed_by = decision.reviewed_by
      report.review_evidence = decision.evidence
    }
    report.status = stage === 'accepted' ? 'acceptance-recorded' : stage
  } catch (error) {
    report.problems.push(error.message)
  }
  return report
}

/** CLI adapter used by both the released artifact and a repository wrapper. */
export function main(argv = process.argv.slice(2)) {
  try {
    const options = {}
    const allowed = new Set(['manifest', 'stage', 'revision', 'receipts', 'harness', 'approval'])
    for (let i = 0; i < argv.length; i += 2) {
      const key = argv[i].slice(2)
      if (!argv[i].startsWith('--') || !allowed.has(key) || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error('invalid option: ' + argv[i])
      options[key] = argv[i + 1]
    }
    if (!options.manifest) throw new Error('--manifest is required')
    const report = inspectDelivery(resolve(options.manifest), options)
    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.problems.length ? 1 : 0
  } catch (error) {
    console.log(JSON.stringify({ status: 'blocked', problems: [error.message], human_decision: 'pending', authorizes_merge: false }))
    process.exitCode = 1
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
