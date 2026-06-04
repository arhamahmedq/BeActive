import { describe, it, expect } from 'vitest'
import {
  requestFriendSchema,
  acceptFriendSchema,
  rejectFriendSchema,
  removeFriendSchema,
  blockUserSchema,
  unblockUserSchema,
  cancelFriendSchema,
  searchUsersSchema,
} from '../../server/modules/friends/friends.schema'

// ---------------------------------------------------------------------------
// Mutation schemas (requestFriendSchema, acceptFriendSchema, etc.)
// ---------------------------------------------------------------------------

describe('requestFriendSchema', () => {
  it('accepts a valid non-empty targetUserId', () => {
    expect(requestFriendSchema.safeParse({ targetUserId: 'user-cuid' }).success).toBe(true)
  })

  it('rejects empty string', () => {
    expect(requestFriendSchema.safeParse({ targetUserId: '' }).success).toBe(false)
  })

  it('rejects missing field', () => {
    expect(requestFriendSchema.safeParse({}).success).toBe(false)
  })
})

describe('acceptFriendSchema / rejectFriendSchema / removeFriendSchema', () => {
  for (const [name, schema] of [
    ['acceptFriendSchema', acceptFriendSchema],
    ['rejectFriendSchema', rejectFriendSchema],
    ['removeFriendSchema', removeFriendSchema],
  ] as const) {
    it(`${name}: accepts valid friendshipId`, () => {
      expect(schema.safeParse({ friendshipId: 'f-cuid' }).success).toBe(true)
    })

    it(`${name}: rejects empty string`, () => {
      expect(schema.safeParse({ friendshipId: '' }).success).toBe(false)
    })

    it(`${name}: rejects missing field`, () => {
      expect(schema.safeParse({}).success).toBe(false)
    })
  }
})

describe('blockUserSchema / unblockUserSchema', () => {
  for (const [name, schema] of [
    ['blockUserSchema', blockUserSchema],
    ['unblockUserSchema', unblockUserSchema],
  ] as const) {
    it(`${name}: accepts a valid non-empty targetUserId`, () => {
      expect(schema.safeParse({ targetUserId: 'user-cuid' }).success).toBe(true)
    })
    it(`${name}: rejects empty string`, () => {
      expect(schema.safeParse({ targetUserId: '' }).success).toBe(false)
    })
    it(`${name}: rejects missing field`, () => {
      expect(schema.safeParse({}).success).toBe(false)
    })
  }
})

describe('cancelFriendSchema', () => {
  it('accepts a valid friendshipId', () => {
    expect(cancelFriendSchema.safeParse({ friendshipId: 'f-cuid' }).success).toBe(true)
  })
  it('rejects empty string', () => {
    expect(cancelFriendSchema.safeParse({ friendshipId: '' }).success).toBe(false)
  })
  it('rejects missing field', () => {
    expect(cancelFriendSchema.safeParse({}).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// searchUsersSchema — query sanitization
// ---------------------------------------------------------------------------

describe('searchUsersSchema — valid input', () => {
  it('accepts a normal 2-char query', () => {
    const result = searchUsersSchema.safeParse({ q: 'bo' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.q).toBe('bo')
  })

  it('accepts a query up to 50 chars', () => {
    expect(searchUsersSchema.safeParse({ q: 'a'.repeat(50) }).success).toBe(true)
  })
})

describe('searchUsersSchema — whitespace handling', () => {
  it('trims leading and trailing whitespace', () => {
    const result = searchUsersSchema.safeParse({ q: '  bob  ' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.q).toBe('bob')
  })

  it('rejects a whitespace-only query (fails min(2) after trim)', () => {
    expect(searchUsersSchema.safeParse({ q: '   ' }).success).toBe(false)
  })

  it('rejects a single-space query', () => {
    expect(searchUsersSchema.safeParse({ q: ' ' }).success).toBe(false)
  })
})

describe('searchUsersSchema — SQL LIKE wildcard injection prevention', () => {
  it('strips % characters from the query', () => {
    const result = searchUsersSchema.safeParse({ q: '%alice%' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.q).toBe('alice')
  })

  it('rejects a query that is only % (nothing left after stripping)', () => {
    // "%" → strip → "" → fails min(2)
    expect(searchUsersSchema.safeParse({ q: '%%' }).success).toBe(false)
  })

  it('strips _ characters from the query', () => {
    const result = searchUsersSchema.safeParse({ q: '_ab_' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.q).toBe('ab')
  })

  it('strips backslash characters from the query', () => {
    const result = searchUsersSchema.safeParse({ q: '\\bo' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.q).toBe('bo')
  })

  it('rejects a query of only wildcards (%_) after stripping', () => {
    expect(searchUsersSchema.safeParse({ q: '%_' }).success).toBe(false)
  })

  it('preserves non-wildcard characters after stripping wildcards', () => {
    const result = searchUsersSchema.safeParse({ q: 'a%b_c' })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.q).toBe('abc')
  })
})

describe('searchUsersSchema — unicode normalization', () => {
  it('NFKC-normalizes the query (full-width to ASCII)', () => {
    // Full-width 'ａ' (U+FF41) NFKC-normalizes to 'a'
    const result = searchUsersSchema.safeParse({ q: 'ａｂ' }) // 'ａｂ'
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.q).toBe('ab')
  })
})

describe('searchUsersSchema — length bounds', () => {
  it('rejects a query shorter than 2 chars after transformation', () => {
    expect(searchUsersSchema.safeParse({ q: 'a' }).success).toBe(false)
  })

  it('rejects a query longer than 50 chars (checked before transform)', () => {
    expect(searchUsersSchema.safeParse({ q: 'a'.repeat(51) }).success).toBe(false)
  })

  it('rejects missing q field', () => {
    expect(searchUsersSchema.safeParse({}).success).toBe(false)
  })
})
