#!/usr/bin/env node
// Findings aggregator — reads .quality/findings/*.json, totals by severity, BLOCKS on Critical.
// This is where "Critical findings block completion" becomes code, not a promise. Node stdlib only.
//
// Each findings file (one per reviewer) must match scripts/review/finding.schema.json:
//   { "reviewer": "security", "findings": [ { "severity": "critical", "file": "...", "line": 12,
//     "title": "...", "detail": "...", "fix": "..." } ] }
//
// Usage: node scripts/review/aggregate.mjs
// Output: .quality/review-report.json + .md. Exit 1 if any Critical OR any schema error.

import { readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, '.quality')
const FIND = join(OUT, 'findings')
const SEVERITIES = ['critical', 'high', 'medium', 'low']

mkdirSync(OUT, { recursive: true })

const files = existsSync(FIND) ? readdirSync(FIND).filter((f) => f.endsWith('.json')) : []
const all = []
const errors = []

if (!files.length) {
  console.log('⚠ no findings in .quality/findings/ — reviewers have not run (or found nothing). Treating as 0 findings.')
}

for (const f of files) {
  let data
  try {
    data = JSON.parse(readFileSync(join(FIND, f), 'utf8'))
  } catch {
    errors.push(`${f}: invalid JSON`)
    continue
  }
  const reviewer = data.reviewer || f.replace('.json', '')
  if (!Array.isArray(data.findings)) {
    errors.push(`${f}: missing "findings" array`)
    continue
  }
  for (const x of data.findings) {
    if (!SEVERITIES.includes(x.severity)) {
      errors.push(`${f}: invalid severity "${x.severity}" (expected ${SEVERITIES.join('|')})`)
      continue
    }
    if (!x.title) {
      errors.push(`${f}: a ${x.severity} finding is missing "title"`)
      continue
    }
    all.push({ reviewer, ...x })
  }
}

// Cross-check the route plan: a planned reviewer with no findings file may never have run.
// (Reviewers must write a file even when they find nothing — an empty findings array.)
let missingReviewers = []
const planPath = join(OUT, 'review-plan.json')
if (existsSync(planPath)) {
  try {
    const plan = JSON.parse(readFileSync(planPath, 'utf8'))
    const ran = new Set(files.map((f) => f.replace('.json', '')))
    missingReviewers = (plan.reviewers || []).map((r) => r.id).filter((id) => !ran.has(id))
  } catch {
    /* no usable plan — skip the cross-check */
  }
}

const counts = Object.fromEntries(SEVERITIES.map((s) => [s, all.filter((x) => x.severity === s).length]))
const blocked = counts.critical > 0
const report = {
  generatedAt: new Date().toISOString(),
  reviewersRun: files.map((f) => f.replace('.json', '')),
  missingReviewers,
  counts,
  total: all.length,
  blocked,
  schemaErrors: errors,
  findings: all,
}
writeFileSync(join(OUT, 'review-report.json'), JSON.stringify(report, null, 2))

const status = blocked ? '❌ BLOCKED — critical findings' : errors.length ? '⚠ schema errors' : counts.high ? '⚠ high findings (review)' : '✅ no critical findings'
const md = [
  `# Review Report`,
  ``,
  `**${status}** · ${report.generatedAt}`,
  ``,
  `Reviewers run: ${report.reviewersRun.join(', ') || '(none)'}`,
  ``,
  `| Severity | Count |`,
  `|---|---|`,
  ...SEVERITIES.map((s) => `| ${s} | ${counts[s]} |`),
  ``,
  ...(all.length
    ? ['## Findings', '', ...all.map((x) => `- **${x.severity.toUpperCase()}** · ${x.reviewer} · \`${x.file || '?'}${x.line ? ':' + x.line : ''}\` — ${x.title}${x.fix ? ` _(fix: ${x.fix})_` : ''}`)]
    : ['_No findings._']),
  ...(errors.length ? ['', '## Schema errors', ...errors.map((e) => `- ${e}`)] : []),
  ...(missingReviewers.length ? ['', '## ⚠ Planned reviewers with no findings file (did they run?)', ...missingReviewers.map((r) => `- ${r}`)] : []),
].join('\n')
writeFileSync(join(OUT, 'review-report.md'), md)

console.log(`\n▶ review aggregate — ${all.length} finding(s) across ${files.length} reviewer file(s)`)
for (const s of SEVERITIES) console.log(`  ${s.padEnd(9)} ${counts[s]}`)
if (missingReviewers.length) console.log(`  ⚠ planned but no findings file: ${missingReviewers.join(', ')}`)
if (errors.length) {
  console.log('\n  schema errors:')
  errors.forEach((e) => console.log('   - ' + e))
}
console.log(`\n  report → .quality/review-report.{json,md}`)
console.log(blocked ? '\n❌ BLOCKED: critical findings must be fixed before completion.\n' : '\n✅ no critical findings.\n')
process.exit(blocked || errors.length ? 1 : 0)
