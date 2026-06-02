import { StreakStatus } from '@prisma/client'
import { toLocalDateStr } from '../../../shared/utils/timezone'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DisplayTier =
  | 'COMPLETED_TODAY'
  | 'PENDING_TODAY'
  | 'AT_RISK'
  | 'BROKEN'
  | 'INACTIVE'

export interface RecomputeResult {
  currentStreak: number
  bestStreak: number
  lastVerifiedDate: string | null // YYYY-MM-DD
  status: StreakStatus
}

// ─── Internal date helpers ────────────────────────────────────────────────────

// Converts YYYY-MM-DD to days-since-epoch (UTC). Used only for arithmetic,
// never for display. Safe because we work at date granularity, not instant.
function toDayNumber(dateStr: string): number {
  const parts = dateStr.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000)
}

// ─── Exported date utilities (used by write path and tests) ──────────────────

// toLocalDateStr is defined once in shared/utils/timezone so the streak engine
// and the posts same-day guard share an identical notion of "today". Re-exported
// here to preserve the streak module's public surface (callers + test mocks).
export { toLocalDateStr }

/**
 * Returns the user's local hour (0–23) for a given UTC instant.
 * Used by deriveDisplayTier to determine AT_RISK transition timing.
 */
export function getLocalHour(instant: Date, tz: string): number {
  // hour12: false with en-US gives "00"–"23"; midnight can come back as "24"
  const raw = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: 'numeric',
    hour12: false,
  }).format(instant)
  const h = parseInt(raw, 10)
  if (Number.isNaN(h)) return 0
  return h === 24 ? 0 : h
}

// ─── Core pure function ───────────────────────────────────────────────────────

/** Threshold at which PENDING_TODAY transitions to AT_RISK (inclusive). */
export const EVENING_HOUR = 20

/**
 * Recomputes the streak projection from the append-only DailyCompletion ledger.
 *
 * Pure: no I/O, no side effects. Takes `now` as a parameter so tests can inject
 * any instant without mocking clocks.
 *
 * @param ledgerRows  All DailyCompletion rows for the user (any order).
 * @param userTz      IANA timezone — used to determine "today" at `now`.
 * @param now         Current instant (injectable for testing).
 */
export function recomputeStreak(
  ledgerRows: ReadonlyArray<{ localDate: string }>,
  userTz: string,
  now: Date
): RecomputeResult {
  if (ledgerRows.length === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      lastVerifiedDate: null,
      status: StreakStatus.INACTIVE,
    }
  }

  // Defensive sort — DB returns ordered by localDate ASC, but don't rely on it
  const sorted = [...ledgerRows]
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.localDate))
    .sort((a, b) => (a.localDate < b.localDate ? -1 : a.localDate > b.localDate ? 1 : 0))

  if (sorted.length === 0) {
    return {
      currentStreak: 0,
      bestStreak: 0,
      lastVerifiedDate: null,
      status: StreakStatus.INACTIVE,
    }
  }

  // Walk sorted dates, tracking the current run and the best run seen so far
  let currentRun = 1
  let bestStreak = 1

  for (let i = 1; i < sorted.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const diff = toDayNumber(sorted[i]!.localDate) - toDayNumber(sorted[i - 1]!.localDate)
    if (diff === 1) {
      currentRun++
    } else if (diff > 1) {
      // Gap of ≥2 days: previous run is complete, restart
      bestStreak = Math.max(bestStreak, currentRun)
      currentRun = 1
    }
    // diff === 0: duplicate date (shouldn't reach here due to UNIQUE, skip)
  }
  bestStreak = Math.max(bestStreak, currentRun)

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const lastVerifiedDate = sorted[sorted.length - 1]!.localDate
  const todayStr = toLocalDateStr(now, userTz)
  const daysSince = toDayNumber(todayStr) - toDayNumber(lastVerifiedDate)

  // BROKEN when a full local calendar day has passed without a completion:
  // today is D+2 or later relative to lastVerifiedDate D.
  const status = daysSince > 1 ? StreakStatus.BROKEN : StreakStatus.ACTIVE

  return {
    currentStreak: currentRun, // preserved even when BROKEN (shown as "you had X")
    bestStreak,
    lastVerifiedDate,
    status,
  }
}

// ─── Display tier derivation ──────────────────────────────────────────────────

/**
 * Derives the UI display tier from persisted state + real-time inputs.
 * Never persisted — computed fresh on each render / API response.
 *
 * @param status         Durable streak status from the Streak projection.
 * @param completedToday Whether a DailyCompletion row exists for today.
 * @param localHour      User's local hour (0–23) at the current instant.
 * @param eveningHour    Hour at which PENDING → AT_RISK (default 20 = 8 PM).
 */
export function deriveDisplayTier(
  status: StreakStatus,
  completedToday: boolean,
  localHour: number,
  eveningHour = EVENING_HOUR
): DisplayTier {
  if (status === StreakStatus.INACTIVE) return 'INACTIVE'
  if (status === StreakStatus.BROKEN) return 'BROKEN'
  // ACTIVE
  if (completedToday) return 'COMPLETED_TODAY'
  return localHour >= eveningHour ? 'AT_RISK' : 'PENDING_TODAY'
}
