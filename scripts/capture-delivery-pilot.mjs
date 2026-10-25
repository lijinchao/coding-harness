import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { runCommandReview } from '../src/command-review.mjs'

// Explicit execution for the self pilot only. The pack's checker remains read-only.
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, i, all) => i % 2 ? pairs : [...pairs, [item.replace(/^--/, ''), all[i + 1]]], []))
const root = resolve(import.meta.dirname, '..')
if (!args.out || !args.baseline || !args.candidate) throw new Error('--baseline, --candidate, and --out are required')
const out = resolve(args.out)
const rel = relative(root, out)
if (rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel)) throw new Error('evidence must be outside the repository')
mkdirSync(out, { recursive: true })
const plan = JSON.parse(readFileSync(resolve(root, 'delivery.plan.json'), 'utf8'))
const results = []
for (const check of plan.checks) {
  for (const [phase, revision] of [['red', args.baseline], ['green', args.candidate]]) {
    const receipt = await runCommandReview(root, revision, check.command, resolve(out, check.id + '.' + phase + '.json'), {
      timeoutMs: 120000,
      onOutput: phase === 'red' ? (result) => {
        for (const stream of ['stdout', 'stderr']) writeFileSync(resolve(out, check.id + '.red.' + stream + '.txt'), result[stream])
      } : undefined,
    })
    results.push({ id: check.id, phase, revision, status: receipt.status, exit_code: receipt.result.exit_code })
  }
}
console.log(JSON.stringify(results, null, 2))
const verified = execFileSync(process.execPath, [resolve(root, 'scripts/check-delivery.mjs'), '--manifest', resolve(root, 'delivery.plan.json'), '--stage', 'verified', '--revision', args.candidate, '--receipts', out], { encoding: 'utf8' })
writeFileSync(resolve(out, 'delivery-report.json'), verified)
console.log(verified)
