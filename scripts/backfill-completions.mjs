/**
 * backfill-completions.mjs — Phase 3: Backfill + Recompute
 *
 * For every user who has a Streak record:
 *   1. Creates a DailyCompletion row for each VERIFIED post that doesn't have one.
 *      UNIQUE(userId, localDate) deduplicates same-day posts automatically.
 *   2. Recomputes the full v2 streak projection from the now-complete ledger.
 *   3. Updates the Streak row if the v2 projection differs from the stored values.
 *
 * Safe to re-run — every step is idempotent.
 *
 * Usage:
 *   node --env-file=app/web/.env.local scripts/backfill-completions.mjs
 *
 * Prerequisites:
 *   - Phase 0 DoD must be green (0 invalid timezones)
 *   - Dev server does NOT need to be running
 *
 * Exit codes:
 *   0 — backfill succeeded, run "npm run validate:parity" next
 *   1 — one or more errors occurred
 */

import { PrismaClient } from '/Users/arhamahmedfiroz/Documents/Projects/BeActive/node_modules/@prisma/client/default.js'

const prisma = new PrismaClient()

// ── Pure helpers — mirrors server/modules/streaks/recomputeStreak.ts ─────────
// (Inlined so the script needs no build step. The TypeScript source is the
//  canonical version and the one covered by unit tests.)

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

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== BeActive — Phase 3: Backfill + Recompute ===\n')
  const now = new Date()

  // Load all users who have a Streak record — these are the only ones that matter
  const streakRows = await prisma.streak.findMany({
    include: { user: { select: { id: true, timezone: true } } },
  })

  console.log(`Processing ${streakRows.length} user(s) with a Streak record...\n`)

  let completionsCreated = 0
  let completionsConflicted = 0
  let streaksUpdated = 0
  let errors = 0

  for (const streak of streakRows) {
    const { user } = streak
    const tz = user.timezone || 'UTC'

    // Step 1: Find VERIFIED posts for this user without a DailyCompletion row
    const posts = await prisma.post.findMany({
      where: { userId: user.id, status: 'VERIFIED', dailyCompletion: null },
      orderBy: { createdAt: 'asc' },
    })

    for (const post of posts) {
      let localDate
      try {
        localDate = toLocalDateStr(post.createdAt, tz)
      } catch {
        console.warn(`  WARN: invalid tz "${tz}" for user ${user.id}, falling back to UTC`)
        localDate = toLocalDateStr(post.createdAt, 'UTC')
      }

      try {
        await prisma.dailyCompletion.create({
          data: { userId: user.id, localDate, postId: post.id, timezone: tz },
        })
        completionsCreated++
        console.log(`  + completion  user=${user.id}  date=${localDate}  post=${post.id}`)
      } catch (err) {
        if (err?.code === 'P2002') {
          // Another post already credited this local date — UNIQUE dedup is correct
          completionsConflicted++
          console.log(`  ~ conflict    user=${user.id}  date=${localDate}  (another post credited this day, skipped)`)
        } else {
          errors++
          console.error(`  ✗ error creating completion for post ${post.id}:`, err?.message ?? String(err))
        }
      }
    }

    // Step 2: Recompute from the now-complete ledger
    const completions = await prisma.dailyCompletion.findMany({
      where: { userId: user.id },
      select: { localDate: true },
      orderBy: { localDate: 'asc' },
    })

    const v2 = recomputeStreak(completions, tz, now)

    // Step 3: Update Streak projection only where it differs (avoids gratuitous writes)
    const needsUpdate =
      streak.current !== v2.currentStreak ||
      streak.best !== v2.bestStreak ||
      streak.status !== v2.status ||
      (streak.lastVerifiedDate ?? null) !== (v2.lastVerifiedDate ?? null)

    if (needsUpdate) {
      try {
        await prisma.streak.update({
          where: { userId: user.id },
          data: {
            current: v2.currentStreak,
            best: v2.bestStreak,
            status: v2.status,
            lastVerifiedDate: v2.lastVerifiedDate,
            // Preserve brokenAt timestamp if already set and still BROKEN; clear if ACTIVE
            brokenAt: v2.status === 'BROKEN' ? (streak.brokenAt ?? now) : null,
          },
        })
        streaksUpdated++
        console.log(
          `  ↑ updated     user=${user.id}` +
          `  current=${streak.current}→${v2.currentStreak}` +
          `  best=${streak.best}→${v2.bestStreak}` +
          `  status=${streak.status}→${v2.status}`
        )
      } catch (err) {
        errors++
        console.error(`  ✗ error updating streak for user ${user.id}:`, err?.message ?? String(err))
      }
    }
  }

  console.log('\n─── Backfill summary ────────────────────────────────')
  console.log(`  DailyCompletion rows created   : ${completionsCreated}`)
  console.log(`  Same-day conflicts (deduped)   : ${completionsConflicted}`)
  console.log(`  Streak projections updated     : ${streaksUpdated}`)
  console.log(`  Errors                         : ${errors}`)
  console.log('─────────────────────────────────────────────────────')

  return { completionsCreated, completionsConflicted, streaksUpdated, errors }
}

main()
  .then(({ errors }) => {
    prisma.$disconnect()
    if (errors > 0) {
      console.error(`\nFAIL — ${errors} error(s). Check output above.`)
      process.exit(1)
    }
    console.log('\nDone. Run "npm run validate:parity" to confirm Phase 3 DoD.')
  })
  .catch((err) => {
    prisma.$disconnect()
    console.error('Fatal:', err)
    process.exit(1)
  })
