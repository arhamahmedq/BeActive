#!/usr/bin/env node
// Stop hook — "definition of done" enforcement for the loop.
//
// ⚠️ INSTALL (you do this — a Stop hook changes the agent's finish behaviour, so
//    it must be your decision, not auto-installed):
//      1. mv loops/loop-stop-gate.mjs .claude/hooks/loop-stop-gate.mjs
//      2. add the "Stop" block from the snippet at the bottom of this file to
//         .claude/settings.local.json (next to the existing PostToolUse hook).
//
// Behaviour: fires when the agent tries to finish. Blocks finishing ONLY when the
// last recorded gate/review result is RED — so a session can't quietly end on a
// known-failing state. Intentionally CHEAP: it reads the JSON the gate already
// wrote (.quality/*); it does NOT re-run the 16s build on every stop.
//
//   quality-report.json passed=false  -> block (gate failed)
//   review-report.json  blocked=true  -> block (a critical finding)
//   files missing / unparseable       -> allow (degrade-safe; never trap a stop)
//   stop_hook_active                  -> allow (guard against re-block loop)
//
// Caveat (honest): it enforces the LAST result, which may be stale if the gate
// wasn't run this task. Run `npm run quality:gate` during the task to refresh it,
// and `npm run loop:snapshot` to record the run on /loop-lab.
// ponytail: reuses the gate's own output; no new measurement, no heavy work on stop.
//
// NOTE: paths below assume the file lives in .claude/hooks/ (two levels under root).

import { readFileSync } from 'node:fs'

function readStdin() {
  try { return JSON.parse(readFileSync(0, 'utf8')) } catch { return {} }
}
function readJSON(p) {
  try { return JSON.parse(readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')) } catch { return null }
}
function allow() { process.exit(0) }
function block(reason) { process.stdout.write(JSON.stringify({ decision: 'block', reason })); process.exit(0) }

const input = readStdin()
if (input.stop_hook_active) allow() // already continued once from this hook — don't loop

const gate = readJSON('.quality/quality-report.json')
const review = readJSON('.quality/review-report.json')

const reasons = []
if (gate && gate.passed === false) {
  const failed = (gate.results ?? []).filter((r) => !r.ok).map((r) => r.id).join(', ') || 'unknown'
  reasons.push(`Quality gate is RED (failed: ${failed}). Run \`npm run quality:gate\`, fix, and re-verify before finishing.`)
}
if (review && review.blocked === true) {
  const c = review.counts?.critical ?? '?'
  reasons.push(`Review is BLOCKED (${c} critical finding(s) in .quality/review-report.json). Resolve them before finishing.`)
}

if (reasons.length) block(`Loop definition-of-done not met:\n- ${reasons.join('\n- ')}`)
allow()

/* ── settings.local.json snippet — add alongside the existing "hooks" block ──
"Stop": [
  { "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/loop-stop-gate.mjs\"" } ] }
]
──────────────────────────────────────────────────────────────────────────── */
