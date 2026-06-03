import { describe, it, expect } from 'vitest'
import { encodeCursor, parseCursor, sliceByCursor } from '../../../server/modules/feed/feed.cursor'
import type { FeedCursor } from '../../../server/modules/feed/feed.cursor'
import { ValidationError } from '../../../server/core/errors/AppError'

const NOW = new Date('2026-01-15T12:00:00Z')
const T0 = NOW.getTime()
const validCursor: FeedCursor = { t: T0, s: 0.8, id: 'post-abc' }

// ---------------------------------------------------------------------------
// encodeCursor / parseCursor round-trip
// ---------------------------------------------------------------------------
describe('encodeCursor + parseCursor — round-trip', () => {
  it('round-trips a valid cursor without loss', () => {
    const encoded = encodeCursor(validCursor)
    const decoded = parseCursor(encoded, NOW)
    expect(decoded).toEqual(validCursor)
  })

  it('uses base64url encoding (no +, /, or = in the output)', () => {
    const encoded = encodeCursor(validCursor)
    expect(encoded).not.toMatch(/[+/=]/)
  })

  it('preserves float precision on the score field through round-trip', () => {
    const cursor: FeedCursor = { t: T0, s: 0.123456789012345, id: 'p' }
    const decoded = parseCursor(encodeCursor(cursor), NOW)
    expect(decoded!.s).toBe(cursor.s)
  })
})

// ---------------------------------------------------------------------------
// parseCursor — absent/empty = first page (no error)
// ---------------------------------------------------------------------------
describe('parseCursor — absent or empty cursor → null (first page, no error)', () => {
  it('returns null for undefined', () => {
    expect(parseCursor(undefined, NOW)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(parseCursor('', NOW)).toBeNull()
  })

  it('returns null for a whitespace-only string', () => {
    expect(parseCursor('   ', NOW)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// parseCursor — malformed cursor → ValidationError (400)
// ---------------------------------------------------------------------------
describe('parseCursor — malformed cursor → ValidationError', () => {
  it('throws for a string that decodes to non-JSON', () => {
    // base64url of 'hello world' is not valid JSON
    const notJson = Buffer.from('hello world').toString('base64url')
    expect(() => parseCursor(notJson, NOW)).toThrow(ValidationError)
  })

  it('throws for a random non-decodable string', () => {
    // '!!!' base64url-decoded is garbage; JSON.parse will fail
    expect(() => parseCursor('!!!invalid!!!', NOW)).toThrow(ValidationError)
  })

  it('throws when t is missing from the payload', () => {
    const bad = Buffer.from(JSON.stringify({ s: 0.5, id: 'abc' })).toString('base64url')
    expect(() => parseCursor(bad, NOW)).toThrow(ValidationError)
  })

  it('throws when s is missing from the payload', () => {
    const bad = Buffer.from(JSON.stringify({ t: T0, id: 'abc' })).toString('base64url')
    expect(() => parseCursor(bad, NOW)).toThrow(ValidationError)
  })

  it('throws when id is missing from the payload', () => {
    const bad = Buffer.from(JSON.stringify({ t: T0, s: 0.5 })).toString('base64url')
    expect(() => parseCursor(bad, NOW)).toThrow(ValidationError)
  })

  it('throws when t is a string instead of a number', () => {
    const bad = Buffer.from(JSON.stringify({ t: 'not-a-number', s: 0.5, id: 'x' })).toString('base64url')
    expect(() => parseCursor(bad, NOW)).toThrow(ValidationError)
  })

  it('throws when s is a string instead of a number', () => {
    const bad = Buffer.from(JSON.stringify({ t: T0, s: 'not-a-number', id: 'x' })).toString('base64url')
    expect(() => parseCursor(bad, NOW)).toThrow(ValidationError)
  })

  it('throws when id is a number instead of a string', () => {
    const bad = Buffer.from(JSON.stringify({ t: T0, s: 0.5, id: 42 })).toString('base64url')
    expect(() => parseCursor(bad, NOW)).toThrow(ValidationError)
  })

  it('throws when the payload is a JSON array instead of an object', () => {
    const bad = Buffer.from(JSON.stringify([1, 2, 3])).toString('base64url')
    expect(() => parseCursor(bad, NOW)).toThrow(ValidationError)
  })
})

// ---------------------------------------------------------------------------
// parseCursor — t bounds
// ---------------------------------------------------------------------------
describe('parseCursor — t bounds (stale or forged T0 → ValidationError)', () => {
  it('throws when t is more than 7 days in the past', () => {
    const staleT = T0 - 8 * 24 * 60 * 60 * 1000
    expect(() => parseCursor(encodeCursor({ t: staleT, s: 0.5, id: 'x' }), NOW)).toThrow(ValidationError)
  })

  it('accepts t at exactly the 7-day lower boundary (inclusive)', () => {
    const boundaryT = T0 - 7 * 24 * 60 * 60 * 1000
    expect(() => parseCursor(encodeCursor({ t: boundaryT, s: 0.5, id: 'x' }), NOW)).not.toThrow()
  })

  it('throws when t is more than 1 hour ahead of now', () => {
    const futureT = T0 + 2 * 60 * 60 * 1000
    expect(() => parseCursor(encodeCursor({ t: futureT, s: 0.5, id: 'x' }), NOW)).toThrow(ValidationError)
  })

  it('accepts t at exactly the 1-hour upper boundary (inclusive)', () => {
    const boundaryT = T0 + 1 * 60 * 60 * 1000
    expect(() => parseCursor(encodeCursor({ t: boundaryT, s: 0.5, id: 'x' }), NOW)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// sliceByCursor — first page (cursor === null)
// ---------------------------------------------------------------------------
describe('sliceByCursor — first page', () => {
  const posts = [
    { id: 'p1', score: 0.9 },
    { id: 'p2', score: 0.8 },
    { id: 'p3', score: 0.7 },
    { id: 'p4', score: 0.6 },
    { id: 'p5', score: 0.5 },
  ]

  it('returns the first N items when cursor is null', () => {
    const { page } = sliceByCursor(posts, null, 2, T0)
    expect(page.map((p) => p.id)).toEqual(['p1', 'p2'])
  })

  it('sets nextCursor when more items remain beyond the page', () => {
    const { nextCursor } = sliceByCursor(posts, null, 2, T0)
    expect(nextCursor).not.toBeNull()
  })

  it('sets nextCursor to null when all items fit in the first page', () => {
    const { nextCursor } = sliceByCursor(posts, null, 10, T0)
    expect(nextCursor).toBeNull()
  })

  it('returns { page: [], nextCursor: null } for an empty ranked array', () => {
    const { page, nextCursor } = sliceByCursor([], null, 5, T0)
    expect(page).toEqual([])
    expect(nextCursor).toBeNull()
  })

  it('embeds T0 into the nextCursor (frozen clock propagates)', () => {
    const { nextCursor } = sliceByCursor(posts, null, 2, T0)
    const decoded = parseCursor(nextCursor!, NOW)
    expect(decoded!.t).toBe(T0)
  })
})

// ---------------------------------------------------------------------------
// sliceByCursor — subsequent pages
// ---------------------------------------------------------------------------
describe('sliceByCursor — subsequent pages', () => {
  const posts = [
    { id: 'p1', score: 0.9 },
    { id: 'p2', score: 0.8 },
    { id: 'p3', score: 0.7 },
    { id: 'p4', score: 0.6 },
    { id: 'p5', score: 0.5 },
  ]

  it('excludes the cursor item itself from the next page', () => {
    const cursor: FeedCursor = { t: T0, s: 0.7, id: 'p3' }
    const { page } = sliceByCursor(posts, cursor, 10, T0)
    expect(page.map((p) => p.id)).not.toContain('p3')
  })

  it('returns the items strictly after the cursor', () => {
    const cursor: FeedCursor = { t: T0, s: 0.8, id: 'p2' }
    const { page } = sliceByCursor(posts, cursor, 2, T0)
    expect(page.map((p) => p.id)).toEqual(['p3', 'p4'])
  })

  it('sets nextCursor to null on the last page', () => {
    const cursor: FeedCursor = { t: T0, s: 0.6, id: 'p4' }
    const { nextCursor } = sliceByCursor(posts, cursor, 10, T0)
    expect(nextCursor).toBeNull()
  })

  it('handles score ties: advances only past items with same score AND id > cursor.id', () => {
    const tiedPosts = [
      { id: 'aaa', score: 0.5 },
      { id: 'bbb', score: 0.5 },
      { id: 'ccc', score: 0.5 },
    ]
    const cursor: FeedCursor = { t: T0, s: 0.5, id: 'bbb' }
    const { page } = sliceByCursor(tiedPosts, cursor, 10, T0)
    expect(page.map((p) => p.id)).toEqual(['ccc'])
  })
})

// ---------------------------------------------------------------------------
// sliceByCursor — candidates === FEED_CANDIDATE_CAP (bounded truncation)
// ---------------------------------------------------------------------------
describe('sliceByCursor — candidates at cap (bounded traversal, no error)', () => {
  it('paginates through exactly cap items and terminates with nextCursor null', () => {
    const CAP = 5
    const cap = Array.from({ length: CAP }, (_, i) => ({
      id: `p${String(i + 1).padStart(2, '0')}`, // p01..p05 for lexical sort correctness
      score: 1 - i * 0.1,
    }))
    const limit = 2

    let cursor: FeedCursor | null = null
    const seenIds: string[] = []
    let iterations = 0

    do {
      const { page, nextCursor } = sliceByCursor(cap, cursor, limit, T0)
      seenIds.push(...page.map((p) => p.id))
      cursor = nextCursor !== null ? parseCursor(nextCursor, NOW) : null
      iterations++
      if (iterations > 20) throw new Error('Pagination loop did not terminate')
    } while (cursor !== null)

    // All cap items seen, no dupes, no gaps, exact order
    expect(seenIds).toHaveLength(CAP)
    expect(seenIds).toEqual(cap.map((p) => p.id))
  })
})
