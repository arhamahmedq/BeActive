/**
 * validate-streak-parity.mjs — Phase 3 DoD gate
 *
 * Read-only parity report. For every user with a Streak record, recomputes the
 * v2 streak from their DailyCompletion ledger and compares it against the stored
 * projection. Reports any divergence.
 *
 * Run AFTER backfill-completions.mjs.
 *
 * Phase 3 DoD: exits 0 with zero DIVERGED rows.
 *
 * Usage:
 *   node --env-file=app/web/.env.local scripts/validate-streak-parity.mjs
 *
 * Exit codes:
 *   0 — all users MATCH  →  Phase 3 DoD: PASS
 *   1 — one or more DIVERGED  →  re-run backfill-completions.mjs to fix
 */

import { PrismaClient } from '/Users/arhamahmedfiroz/Documents/Projects/BeActive/node_modules/@prisma/client/default.js'

const prisma = new PrismaClient()

// ── Pure helpers — mirrors server/modules/streaks/recomputeStreak.ts ─────────

function toLocalDateStr(instant, tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant)
}

function toDayNumber(dateStr) {
  const p = dateStr.split('-')
  return Math.floor(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 86_400_000)
}

function recomputeStreak(ledgerRows, userTz, now) {
  if (ledgerRows.length === 0) {
    return { currentStreak: 0, bestStreak: 0, lastVerifiedDate: null, status: 'INACTIVE' }
  }
  const sorted = [...ledgerRows]
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.localDate))
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0))
  if (sorted.length === 0) {
    return { currentStreak: 0, bestStreak: 0, lastVerifiedDate: null, status: 'INACTIVE' }
  }
  let currentRun = 1
  let best = 1
  for (let i = 1; i < sorted.length; i++) {
    const diff = toDayNumber(sorted[i].localDate) - toDayNumber(sorted[i - 1].localDate)
    if (diff === 1) {
      currentRun++
    } else if (diff > 1) {
      best = Math.max(best, currentRun)
      currentRun = 1
    }
  }
  best = Math.max(best, currentRun)
  const lastVerifiedDate = sorted[sorted.length - 1].localDate
  const todayStr = toLocalDateStr(now, userTz)
  const daysSince = toDayNumber(todayStr) - toDayNumber(lastVerifiedDate)
  return {
    currentStreak: currentRun,
    bestStreak: best,
    lastVerifiedDate,
    status: daysSince > 1 ? 'BROKEN' : 'ACTIVE',
  }
}

function parityMatch(stored, computed) {
  return (
    stored.current === computed.currentStreak &&
    stored.best === computed.bestStreak &&
    stored.status === computed.status &&
    (stored.lastVerifiedDate ?? null) === (computed.lastVerifiedDate ?? null)
  )
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== BeActive — Phase 3: Parity Validation ===\n')
  const now = new Date()

  const streakRows = await prisma.streak.findMany({
    include: {
      user: { select: { id: true, username: true, timezone: true } },
    },
  })

  console.log(`Checking ${streakRows.length} streak record(s)...\n`)

  let matched = 0
  let diverged = 0
  let inactiveNoLedger = 0
  const divergences = []

  for (const streak of streakRows) {
    const { user } = streak
    const tz = user.timezone || 'UTC'

    const completions = await prisma.dailyCompletion.findMany({
      where: { userId: user.id },
      select: { localDate: true },
      orderBy: { localDate: 'asc' },
    })

    // INACTIVE with zero completions is the baseline — expected, skip as trivially correct
    if (completions.length === 0 && streak.status === 'INACTIVE' && streak.current === 0) {
      inactiveNoLedger++
      continue
    }

    const v2 = recomputeStreak(completions, tz, now)

    if (parityMatch(streak, v2)) {
      matched++
    } else {
      diverged++
      divergences.push({
        userId: user.id,
        username: user.username,
        stored: {
          current: streak.current,
          best: streak.best,
          status: streak.status,
          lastVerifiedDate: streak.lastVerifiedDate ?? null,
        },
        v2: {
          current: v2.currentStreak,
          best: v2.bestStreak,
          status: v2.status,
          lastVerifiedDate: v2.lastVerifiedDate,
        },
        completionCount: completions.length,
      })
    }
  }

  console.log(`─── Parity report ───────────────────────────────────`)
  console.log(`  Total streak records : ${streakRows.length}`)
  console.log(`  INACTIVE (no ledger) : ${inactiveNoLedger}  (trivially correct)`)
  console.log(`  MATCH                : ${matched}`)
  console.log(`  DIVERGED             : ${diverged}`)
  console.log(`─────────────────────────────────────────────────────`)

  if (divergences.length > 0) {
    console.log('\n─── Diverged users ──────────────────────────────────')
    for (const d of divergences) {
      console.log(`\n  @${d.username} (${d.userId})  completions=${d.completionCount}`)
      console.log(`    stored  : current=${d.stored.current}  best=${d.stored.best}  status=${d.stored.status}  lastDate=${d.stored.lastVerifiedDate}`)
      console.log(`    v2      : current=${d.v2.current}  best=${d.v2.best}  status=${d.v2.status}  lastDate=${d.v2.lastVerifiedDate}`)
    }
    console.log('\n  Fix: re-run "npm run backfill:completions"')
  }

  return diverged
}

main()
  .then((diverged) => {
    prisma.$disconnect()
    if (diverged > 0) {
      console.error(`\nPhase 3 DoD: FAIL — ${diverged} diverged user(s).`)
      process.exit(1)
    }
    console.log('\nPhase 3 DoD: PASS — all streak projections match v2 computation.')
  })
  .catch((err) => {
    prisma.$disconnect()
    console.error('Fatal:', err)
    process.exit(1)
  })
