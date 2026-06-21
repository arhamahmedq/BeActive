#!/usr/bin/env node
// Active quality gate — runs lint, typecheck, build, test, aggregates to ONE report,
// exit code = pass/fail. Node stdlib only, zero deps. The deterministic "is this done?" check.
//
// Usage:
//   node scripts/quality-gate.mjs              # all four checks
//   node scripts/quality-gate.mjs --quick      # skip the slow build (inner-loop iterations)
//   node scripts/quality-gate.mjs --only=lint,test
//   node scripts/quality-gate.mjs --skip=build
//
// Output: .quality/quality-report.json + .quality/quality-report.md. Exit 1 if any check fails.

import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, '.quality')

const CHECKS = [
  { id: 'lint', cmd: 'npm run lint' },
  { id: 'typecheck', cmd: 'npm run type-check' },
  { id: 'build', cmd: 'npm run build' },
  { id: 'test', cmd: 'npm test' },
]

const args = process.argv.slice(2)
const listFlag = (flag) => {
  const a = args.find((x) => x.startsWith(flag))
  return a ? a.split('=')[1].split(',').map((s) => s.trim()).filter(Boolean) : null
}
const only = listFlag('--only=')
const skip = new Set(listFlag('--skip=') || [])
if (args.includes('--quick')) skip.add('build')

const selected = CHECKS.filter((c) => (only ? only.includes(c.id) : true) && !skip.has(c.id))

const env = { ...process.env }
// Prisma only needs a URL shape to `generate` (build runs it); fall back if unset locally.
if (!env.DATABASE_URL) env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test'

function run(check) {
  const t0 = Date.now()
  const r = spawnSync(check.cmd, { cwd: ROOT, shell: true, encoding: 'utf8', env, maxBuffer: 64 * 1024 * 1024 })
  const out = (r.stdout || '') + (r.stderr || '')
  return {
    id: check.id,
    cmd: check.cmd,
    ok: r.status === 0,
    exitCode: r.status,
    durationMs: Date.now() - t0,
    tail: out.split('\n').slice(-30).join('\n'),
  }
}

mkdirSync(OUT, { recursive: true })
console.log(`\n▶ quality gate — ${selected.map((c) => c.id).join(', ')}${skip.size ? `  (skipped: ${[...skip].join(', ')})` : ''}\n`)

const results = []
for (const c of selected) {
  process.stdout.write(`  running ${c.id} … `)
  const res = run(c)
  results.push(res)
  console.log(res.ok ? `✅ ${(res.durationMs / 1000).toFixed(1)}s` : `❌ ${(res.durationMs / 1000).toFixed(1)}s (exit ${res.exitCode})`)
}

const passed = results.every((r) => r.ok)
const report = {
  generatedAt: new Date().toISOString(),
  passed,
  summary: Object.fromEntries(results.map((r) => [r.id, r.ok ? 'pass' : 'fail'])),
  skipped: [...skip],
  results,
}
writeFileSync(join(OUT, 'quality-report.json'), JSON.stringify(report, null, 2))

const md = [
  `# Quality Gate Report`,
  ``,
  `**${passed ? '✅ PASS' : '❌ FAIL'}** · ${report.generatedAt}`,
  ``,
  `| Check | Result | Time |`,
  `|---|---|---|`,
  ...results.map((r) => `| ${r.id} | ${r.ok ? '✅ pass' : '❌ fail'} | ${(r.durationMs / 1000).toFixed(1)}s |`),
  skip.size ? `\n_Skipped: ${[...skip].join(', ')}_` : ``,
  ...results.filter((r) => !r.ok).flatMap((r) => [``, `### ❌ ${r.id} (exit ${r.exitCode})`, '```', r.tail, '```']),
].join('\n')
writeFileSync(join(OUT, 'quality-report.md'), md)

console.log(`\n  report → .quality/quality-report.{json,md}`)
console.log(passed ? '\n✅ quality gate PASSED\n' : '\n❌ quality gate FAILED\n')
process.exit(passed ? 0 : 1)
