import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeAtomic } from './state.mjs'

export const SYSTEM_CI_LAYOUT = Object.freeze({
  receipts: '.harness/system-ci/receipts',
  history: '.harness/system-ci/history',
  current: '.harness/system-ci/current/system-ci.json',
})

const GITHUB = [
  '# Review before use: add checkout steps for every repository in system.manifest.json.',
  '# Restore earlier reports into .harness/system-ci/history with your CI artifact mechanism.',
  'name: system-ci-shadow',
  '',
  'on:',
  '  workflow_dispatch:',
  '  pull_request:',
  '',
  'jobs:',
  '  system-ci-shadow:',
  '    runs-on: ubuntu-latest',
  '    steps:',
  '      - uses: actions/checkout@v5',
  '        with:',
  '          fetch-depth: 0',
  '      - uses: actions/setup-node@v5',
  '        with:',
  "          node-version: '22'",
  '      - name: Prepare the current report directory',
  '        run: mkdir -p .harness/system-ci/current',
  '      - name: Observe system qualification in Shadow mode',
  '        run: ./harness system-ci --manifest system.manifest.json --receipts .harness/system-ci/receipts --history .harness/system-ci/history > .harness/system-ci/current/system-ci.json',
  '      - name: Archive the current observation and receipts',
  '        if: always()',
  '        uses: actions/upload-artifact@v4',
  '        with:',
  "          name: system-ci-shadow-${{ github.run_id }}",
  '          path: |',
  '            .harness/system-ci/current/system-ci.json',
  '            .harness/system-ci/receipts',
  '',
].join('\n')

const GITLAB = [
  '# Review before use: configure checkout paths for every repository in system.manifest.json.',
  '# Restore earlier reports into .harness/system-ci/history with your CI artifact mechanism.',
  'system_ci_shadow:',
  '  image: node:22',
  '  stage: test',
  '  script:',
  '    - mkdir -p .harness/system-ci/current',
  '    - ./harness system-ci --manifest system.manifest.json --receipts .harness/system-ci/receipts --history .harness/system-ci/history > .harness/system-ci/current/system-ci.json',
  '  artifacts:',
  '    when: always',
  '    paths:',
  '      - .harness/system-ci/current/system-ci.json',
  '      - .harness/system-ci/receipts',
  '',
].join('\n')

const TEMPLATES = Object.freeze({ github: GITHUB, gitlab: GITLAB })

export function renderSystemCiTemplate(provider) {
  if (!Object.hasOwn(TEMPLATES, provider)) throw new Error('provider must be github or gitlab')
  return TEMPLATES[provider]
}

export function writeSystemCiTemplate(provider, outPath, options = {}) {
  const out = resolve(outPath)
  if (existsSync(out) && options.force !== true) throw new Error('template output already exists; choose another path or pass --force')
  writeAtomic(out, renderSystemCiTemplate(provider))
  return out
}
