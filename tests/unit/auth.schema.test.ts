import { describe, it, expect } from 'vitest'
import { signupSchema, loginSchema } from '../../server/modules/auth/auth.schema'

describe('signupSchema', () => {
  const valid = { email: 'user@example.com', username: 'john_doe', password: 'password123' }

  it('accepts valid signup data', () => {
    expect(signupSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects invalid email', () => {
    const result = signupSchema.safeParse({ ...valid, email: 'not-an-email' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('email')
    }
  })

  it('rejects username shorter than 3 characters', () => {
    const result = signupSchema.safeParse({ ...valid, username: 'ab' })
    expect(result.success).toBe(false)
  })

  it('rejects username longer than 20 characters', () => {
    const result = signupSchema.safeParse({ ...valid, username: 'a'.repeat(21) })
    expect(result.success).toBe(false)
  })

  it('rejects username with invalid characters', () => {
    const result = signupSchema.safeParse({ ...valid, username: 'john doe' })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('letters, numbers')
    }
  })

  it('accepts username with underscores', () => {
    const result = signupSchema.safeParse({ ...valid, username: 'john_doe_123' })
    expect(result.success).toBe(true)
  })

  it('rejects password shorter than 8 characters', () => {
    const result = signupSchema.safeParse({ ...valid, password: '1234567' })
    expect(result.success).toBe(false)
  })

  it('rejects missing required fields', () => {
    expect(signupSchema.safeParse({}).success).toBe(false)
    expect(signupSchema.safeParse({ email: 'a@b.com' }).success).toBe(false)
  })
})

describe('loginSchema', () => {
  const valid = { email: 'user@example.com', password: 'anypassword' }

  it('accepts valid login data', () => {
    expect(loginSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects invalid email format', () => {
    const result = loginSchema.safeParse({ ...valid, email: 'bad' })
    expect(result.success).toBe(false)
  })

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ ...valid, password: '' })
    expect(result.success).toBe(false)
  })

  it('rejects missing fields', () => {
    expect(loginSchema.safeParse({}).success).toBe(false)
  })
})
