import { describe, it, expect } from 'vitest'
import { createCommentSchema, commentsQuerySchema } from '../../server/modules/interactions/interactions.schema'

describe('createCommentSchema', () => {
  it('accepts a normal comment', () => {
    expect(createCommentSchema.safeParse({ body: 'nice work!' }).success).toBe(true)
  })

  it('trims and rejects a whitespace-only body', () => {
    expect(createCommentSchema.safeParse({ body: '   ' }).success).toBe(false)
  })

  it('rejects an empty body', () => {
    expect(createCommentSchema.safeParse({ body: '' }).success).toBe(false)
  })

  it('rejects a body longer than 300 chars', () => {
    expect(createCommentSchema.safeParse({ body: 'a'.repeat(301) }).success).toBe(false)
  })

  it('trims surrounding whitespace from the stored value', () => {
    const r = createCommentSchema.safeParse({ body: '  hello  ' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.body).toBe('hello')
  })
})

describe('commentsQuerySchema', () => {
  it('defaults limit to 20', () => {
    const r = commentsQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.limit).toBe(20)
  })

  it('coerces a numeric string limit', () => {
    const r = commentsQuerySchema.safeParse({ limit: '10' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.limit).toBe(10)
  })

  it('rejects a limit over the max (50)', () => {
    expect(commentsQuerySchema.safeParse({ limit: '500' }).success).toBe(false)
  })

  it('accepts an optional cursor', () => {
    expect(commentsQuerySchema.safeParse({ cursor: 'abc' }).success).toBe(true)
  })
})
