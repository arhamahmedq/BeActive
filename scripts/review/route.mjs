#!/usr/bin/env node
// Deterministic review router — turns the current diff into a machine-readable plan of
// which reviewers apply. Removes "did Claude remember to review?". Node stdlib only.
//
// Usage:
//   node scripts/review/route.mjs            # working tree vs HEAD (+ untracked)
//   node scripts/review/route.mjs origin/master   # diff vs a base ref
//
// Output: .quality/review-plan.json

import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const OUT = join(ROOT, '.quality')
const base = process.argv[2] || null

const sh = (cmd) => {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

let changed
if (base) {
  changed = sh(`git diff --name-only ${base}`).split('\n').filter(Boolean)
} else {
  const tracked = sh('git diff --name-only HEAD').split('\n').filter(Boolean)
  const untracked = sh('git ls-files --others --exclude-standard').split('\n').filter(Boolean)
  changed = [...new Set([...tracked, ...untracked])]
}

const added = new Set(
  (base ? sh(`git diff --name-status ${base}`) : sh('git diff --name-status HEAD'))
    .split('\n')
    .filter((l) => l.startsWith('A'))
    .map((l) => l.split('\t').pop())
)

const codeFiles = changed.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(f))

// Each reviewer: `match(file)` (path trigger) and optional `always()` (run on any code change).
const REVIEWERS = [
  {
    id: 'security',
    skill: 'security-reviewer',
    checklist: '.claude/checklists/security.md',
    always: () => codeFiles.length > 0,
    match: (f) =>
      /^app\/web\/app\/api\//.test(f) ||
      /^server\/modules\/(auth|ai)\//.test(f) ||
      /^server\/core\/middleware\//.test(f) ||
      /(uploads|cron|queue)/.test(f) ||
      /prisma\/schema\.prisma$/.test(f),
  },
  {
    id: 'qa',
    skill: 'qa-reviewer',
    checklist: '.claude/checklists/qa.md',
    always: () => codeFiles.length > 0,
    match: (f) => /^server\//.test(f) || /^shared\//.test(f) || /^tests\//.test(f),
  },
  {
    id: 'ui',
    skill: 'ui-reviewer',
    checklist: '.claude/checklists/ui-ux.md',
    match: (f) =>
      /^app\/web\/components\//.test(f) ||
      /^app\/web\/app\/\((main|auth)\)/.test(f) ||
      /^app\/web\/styles\//.test(f) ||
      /(story-card|share-card)/.test(f) ||
      /\.css$/.test(f),
  },
  {
    id: 'mobile-performance',
    skill: 'mobile-performance-reviewer',
    checklist: '.claude/checklists/mobile-performance.md',
    match: (f) =>
      /\.repo\.ts$/.test(f) ||
      /^server\/modules\/feed\//.test(f) ||
      /^server\/modules\/posts\//.test(f) ||
      /(uploads|story-card)/.test(f) ||
      /^server\/modules\/ai\//.test(f) ||
      /\/api\/queue\//.test(f) ||
      /app\/web\/package\.json$/.test(f),
  },
  {
    id: 'startup-pm',
    skill: 'startup-pm-reviewer',
    checklist: '.claude/checklists/startup-pm.md',
    match: (f) =>
      /package\.json$/.test(f) ||
      /prisma\/schema\.prisma$/.test(f) ||
      /\.env\.example$/.test(f) ||
      (added.has(f) && (/^app\/web\/app\//.test(f) || /^server\/modules\//.test(f))),
  },
]

const plan = []
for (const r of REVIEWERS) {
  const hits = changed.filter(r.match)
  const always = r.always ? r.always() : false
  if (always || hits.length) {
    plan.push({
      id: r.id,
      skill: r.skill,
      checklist: r.checklist,
      reason: always && !hits.length ? 'always-on for code changes' : `matched ${hits.length} file(s)`,
      files: hits.slice(0, 20),
    })
  }
}

mkdirSync(OUT, { recursive: true })
// Fresh cycle: clear stale findings so an issue fixed since the last run can't keep blocking.
rmSync(join(OUT, 'findings'), { recursive: true, force: true })
mkdirSync(join(OUT, 'findings'), { recursive: true })
const out = { generatedAt: new Date().toISOString(), base: base || 'working-tree', changedFiles: changed, reviewers: plan }
writeFileSync(join(OUT, 'review-plan.json'), JSON.stringify(out, null, 2))

console.log(`\n▶ review router — ${changed.length} changed file(s), base: ${out.base}\n`)
if (!plan.length) console.log('  no reviewers matched (no code changes).')
for (const p of plan) console.log(`  • ${p.id.padEnd(20)} ${p.reason}`)
console.log(`\n  plan → .quality/review-plan.json (run the listed skills, write .quality/findings/<id>.json)\n`)
