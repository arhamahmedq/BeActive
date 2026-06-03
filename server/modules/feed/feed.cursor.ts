import { ValidationError } from '../../../server/core/errors/AppError'

export interface FeedCursor {
  t: number  // T0 epoch ms (frozen snapshot clock)
  s: number  // last page's final score
  id: string // last page's final item id
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
const ONE_HOUR_MS = 60 * 60 * 1000

export function encodeCursor(payload: FeedCursor): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url')
}

/**
 * Parse an opaque cursor string from the client.
 * - undefined or empty/whitespace → null (first page, not an error)
 * - non-empty but malformed/bad-shape/out-of-bounds t → ValidationError (400)
 */
export function parseCursor(raw: string | undefined, now: Date): FeedCursor | null {
  if (raw === undefined || raw.trim() === '') return null

  let parsed: unknown
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf-8')
    parsed = JSON.parse(decoded)
  } catch {
    throw new ValidationError([{ field: 'cursor', message: 'Malformed cursor' }])
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).t !== 'number' ||
    typeof (parsed as Record<string, unknown>).s !== 'number' ||
    typeof (parsed as Record<string, unknown>).id !== 'string'
  ) {
    throw new ValidationError([{ field: 'cursor', message: 'Malformed cursor' }])
  }

  const cursor = parsed as FeedCursor
  const nowMs = now.getTime()
  if (cursor.t < nowMs - SEVEN_DAYS_MS || cursor.t > nowMs + ONE_HOUR_MS) {
    throw new ValidationError([{ field: 'cursor', message: 'Cursor has expired or is invalid' }])
  }

  return cursor
}

/**
 * Slice the pre-ranked array into one page.
 *
 * cursor === null  → first page: take the first `limit` items.
 * cursor !== null  → subsequent page: items strictly after the cursor in the
 *                    total order (score < s) OR (score === s AND id > cursor.id),
 *                    then take `limit`.
 *
 * nextCursor is non-null only when `limit` items were returned AND more remain
 * in the pool. T0 is embedded into the nextCursor so the frozen clock
 * propagates across every page without a live Date.now() call.
 */
export function sliceByCursor<T extends { id: string; score: number }>(
  ranked: T[],
  cursor: FeedCursor | null,
  limit: number,
  T0: number
): { page: T[]; nextCursor: string | null } {
  const pool =
    cursor === null
      ? ranked
      : ranked.filter(
          (p) => p.score < cursor.s || (p.score === cursor.s && p.id > cursor.id)
        )

  const page = pool.slice(0, limit)

  if (page.length === 0) return { page: [], nextCursor: null }

  const last = page[page.length - 1]!  // safe: page.length === 0 returns early above
  const nextCursor = pool.length > limit ? encodeCursor({ t: T0, s: last.score, id: last.id }) : null

  return { page, nextCursor }
}
