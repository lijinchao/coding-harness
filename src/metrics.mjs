/**
 * Turn the recorded gate reports into the numbers a budget can judge.
 *
 * A report line is one `harness gates` run: `{ at, version, tool, results }`.
 * The window is the last `window` runs, so an old incident stops counting once
 * enough runs have been recorded after it.
 *
 * `exclude` names gate ids the window ignores. A gate that judges the window
 * must be able to name itself: its own verdict then never feeds the evidence it
 * reads, so a breached window can recover by recording runs instead of
 * ratcheting itself red forever.
 *
 * @param {object[]} entries - Report entries, oldest first.
 * @param {number} [window] - How many recent runs the budget judges.
 * @param {string[]} [exclude] - Gate ids the window ignores.
 * @returns {{ runs: number, green: number, firstPassRate: number|null, flaky: string[], timeouts: number, failures: Record<string, number> }}
 */
export function metricsWindow(entries, window = 20, exclude = []) {
  const runs = entries.slice(-Math.max(1, window))
  const ignored = new Set(exclude)
  const stats = new Map()
  let green = 0
  for (const run of runs) {
    const results = (Array.isArray(run?.results) ? run.results : []).filter((result) => !ignored.has(result.id))
    if (results.length > 0 && results.every((result) => result.ok === true)) green += 1
    for (const result of results) {
      const entry = stats.get(result.id) ?? { runs: 0, failures: 0, timeouts: 0 }
      entry.runs += 1
      if (result.ok !== true && result.skipped !== true) entry.failures += 1
      if (result.timedOut === true) entry.timeouts += 1
      stats.set(result.id, entry)
    }
  }
  const flaky = []
  const failures = {}
  let timeouts = 0
  for (const [id, entry] of stats) {
    if (entry.failures > 0) failures[id] = entry.failures
    if (entry.failures > 0 && entry.failures < entry.runs) flaky.push(id)
    timeouts += entry.timeouts
  }
  return {
    runs: runs.length,
    green,
    firstPassRate: runs.length === 0 ? null : green / runs.length,
    flaky: flaky.sort(),
    timeouts,
    failures,
  }
}

/**
 * The budget a repository declares, judged against one window.
 *
 * Only the declared limits are judged: a repository that budgets first-pass
 * rate alone is not failed for a timeout it chose not to bound.
 *
 * @param {object} summary - A `metricsWindow` result.
 * @param {object} budget - `governance.metrics`.
 * @returns {string[]}
 */
export function budgetProblems(summary, budget) {
  const problems = []
  if (summary.runs === 0) return problems
  if (budget.minFirstPassRate !== undefined && summary.firstPassRate !== null && summary.firstPassRate < budget.minFirstPassRate) {
    problems.push('first-pass rate ' + summary.firstPassRate.toFixed(2) + ' is below the declared ' + budget.minFirstPassRate + ' over ' + summary.runs + ' run(s)')
  }
  if (budget.maxFlaky !== undefined && summary.flaky.length > budget.maxFlaky) {
    problems.push('flaky gates ' + summary.flaky.join(', ') + ' exceed the declared ' + budget.maxFlaky + ' (' + summary.flaky.length + ' in ' + summary.runs + ' run(s))')
  }
  if (budget.maxTimeouts !== undefined && summary.timeouts > budget.maxTimeouts) {
    problems.push('timeouts ' + summary.timeouts + ' exceed the declared ' + budget.maxTimeouts + ' over ' + summary.runs + ' run(s)')
  }
  return problems
}

/**
 * Read a JSONL log of gate reports.
 *
 * @param {string} path - Report file.
 * @param {Function} read - `readFileSync`.
 * @returns {object[]}
 */
export function readRuns(path, read) {
  return read(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line))
}
