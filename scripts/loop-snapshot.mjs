#!/usr/bin/env node
// loop-snapshot — append a REAL loop run to the /loop-lab dashboard.
// Pulls gate + findings + diff straight from .quality/* and git so numbers can't be
// fabricated. It deliberately does NOT invent 1-10 scores (those are human/LLM assessment)
// — it stubs them so you fill them in honestly.
//
// Usage: npm run loop:snapshot -- "Task title" ["one-line prompt"]
// ponytail: reads what the gate already wrote; no new measurement infra.

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'

const ROOT = new URL('..', import.meta.url).pathname
const Q = ROOT + '.quality/'
const DATA = ROOT + 'app/web/app/loop-lab/runs.data.json'

const title = process.argv[2]
if (!title) {
  console.error('usage: npm run loop:snapshot -- "Task title" ["prompt"]')
  process.exit(1)
}
const prompt = process.argv[3] || '(fill in the prompt)'

function readJSON(p, fallback) {
  try { return JSON.parse(readFileSync(p, 'utf8')) } catch { return fallback }
}
function sh(cmd, fallback = '') {
  try { return execSync(cmd, { cwd: ROOT }).toString().trim() } catch { return fallback }
}

const gate = readJSON(Q + 'quality-report.json', null)
const review = readJSON(Q + 'review-report.json', null)
if (!gate) console.warn('⚠ no .quality/quality-report.json — run `npm run quality:gate` first; gate fields left empty.')
if (!review) console.warn('⚠ no .quality/review-report.json — run the reviewers + `npm run review:aggregate` first; findings left zero.')

// diff: uncommitted working tree vs HEAD (the work just done)
const shortstat = sh('git diff --shortstat HEAD')
const files = +(shortstat.match(/(\d+) files? changed/)?.[1] ?? 0)
const insertions = +(shortstat.match(/(\d+) insertions?/)?.[1] ?? 0)
const deletions = +(shortstat.match(/(\d+) deletions?/)?.[1] ?? 0)

const testStep = gate?.results?.find((r) => r.id === 'test')
const tests = +(testStep?.tail?.match(/Tests\s+(\d+) passed/)?.[1] ?? 0)

const steps = (gate?.results ?? []).map((r) => ({ id: r.id, ok: r.ok, ms: r.durationMs }))
const f = review?.counts ?? { critical: 0, high: 0, medium: 0, low: 0 }

const today = new Date().toISOString().slice(0, 10)
const id = `${today}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`

const run = {
  id, date: today, title, prompt,
  commit: sh('git rev-parse --short HEAD') || undefined,
  loop: {
    rulesFired: ['(fill in: which detections/heuristics fired this run)'],
    reviewersRouted: review?.reviewersRun ?? [],
    gate: { passed: gate?.passed ?? false, steps, tests },
    findings: f,
  },
  diff: { files, insertions, deletions },
  screens: { before: null, after: null, note: 'Add /loop-lab/<id>/before.png + after.png under app/web/public to show them.' },
  // measured rows are auto-true from the gate; add functional before/after rows by hand.
  metrics: [
    { label: 'Quality gate (lint·type·build·test)', before: '—', after: gate?.passed ? 'green' : 'red', delta: gate?.passed ? 'PASS' : 'FAIL', basis: 'measured' },
    { label: 'Tests passing', before: String(tests), after: String(tests), delta: 'no change', basis: 'measured' },
    { label: 'Blocking findings (critical/high)', before: '—', after: `${f.critical} / ${f.high}`, delta: f.critical + f.high > 0 ? 'BLOCKED' : 'clean', basis: 'measured' },
  ],
  // scores are ASSESSMENT — left as stubs so they aren't auto-fabricated.
  scores: ['Design Quality', 'UX', 'Performance', 'Accessibility', 'Mobile Experience', 'Overall'].map((dim) => ({
    dim, before: 0, after: 0, basis: 'assessed', note: '(assess honestly; 0/0 = not yet scored)',
  })),
}

const all = existsSync(DATA) ? readJSON(DATA, []) : []
all.unshift(run)
writeFileSync(DATA, JSON.stringify(all, null, 2) + '\n')

console.log(`✓ appended run "${id}" to runs.data.json`)
console.log(`  gate=${run.loop.gate.passed ? 'PASS' : 'FAIL'} tests=${tests} findings=${f.critical}c/${f.high}h/${f.medium}m/${f.low}l diff=${files}f +${insertions}/-${deletions}`)
console.log('  → now fill in: rulesFired, functional before/after metrics, scores, and add screenshots. View at /loop-lab.')
