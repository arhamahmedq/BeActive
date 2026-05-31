import { describe, it, expect } from 'vitest'
import { signupSchema, loginSchema } from '../../server/modules/auth/auth.schema'

describe('signupSchema', () => {
  const valid = { email: 'user@example.com', username: 'john_doe', password: 'password123' }

  it('accepts valid signup data', () => {
    expect(signupSchema.safeParse(valid).success).toBe(true)
  })

  // Email
  it('rejects invalid email', () => {
    const result = signupSchema.safeParse({ ...valid, email: 'not-an-email' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].path).toContain('email')
  })

  it('accepts email with uppercase letters (service layer normalises)', () => {
    expect(signupSchema.safeParse({ ...valid, email: 'USER@EXAMPLE.COM' }).success).toBe(true)
  })

  it('rejects empty email', () => {
    expect(signupSchema.safeParse({ ...valid, email: '' }).success).toBe(false)
  })

  it('rejects email exceeding 254 characters', () => {
    const longEmail = `${'a'.repeat(250)}@b.com`
    expect(signupSchema.safeParse({ ...valid, email: longEmail }).success).toBe(false)
  })

  // Username — boundary values
  it('accepts username with exactly 3 characters (lower boundary)', () => {
    expect(signupSchema.safeParse({ ...valid, username: 'abc' }).success).toBe(true)
  })

  it('accepts username with exactly 20 characters (upper boundary)', () => {
    expect(signupSchema.safeParse({ ...valid, username: 'a'.repeat(20) }).success).toBe(true)
  })

  it('rejects username shorter than 3 characters', () => {
    expect(signupSchema.safeParse({ ...valid, username: 'ab' }).success).toBe(false)
  })

  it('rejects username longer than 20 characters', () => {
    expect(signupSchema.safeParse({ ...valid, username: 'a'.repeat(21) }).success).toBe(false)
  })

  it('rejects username with spaces', () => {
    const result = signupSchema.safeParse({ ...valid, username: 'john doe' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toContain('letters, numbers')
  })

  it('rejects username with a hyphen', () => {
    expect(signupSchema.safeParse({ ...valid, username: 'john-doe' }).success).toBe(false)
  })

  it('rejects username with a dot', () => {
    expect(signupSchema.safeParse({ ...valid, username: 'john.doe' }).success).toBe(false)
  })

  it('accepts username with underscores and numbers', () => {
    expect(signupSchema.safeParse({ ...valid, username: 'john_doe_123' }).success).toBe(true)
  })

  it('accepts username that is all numbers', () => {
    expect(signupSchema.safeParse({ ...valid, username: '12345' }).success).toBe(true)
  })

  it('accepts username starting with underscore', () => {
    expect(signupSchema.safeParse({ ...valid, username: '_johndoe' }).success).toBe(true)
  })

  it('rejects empty username', () => {
    expect(signupSchema.safeParse({ ...valid, username: '' }).success).toBe(false)
  })

  // Password
  it('accepts password with exactly 8 characters (lower boundary)', () => {
    expect(signupSchema.safeParse({ ...valid, password: '12345678' }).success).toBe(true)
  })

  it('rejects password with exactly 7 characters (one below boundary)', () => {
    expect(signupSchema.safeParse({ ...valid, password: '1234567' }).success).toBe(false)
  })

  it('rejects password exceeding 128 characters', () => {
    expect(signupSchema.safeParse({ ...valid, password: 'a'.repeat(129) }).success).toBe(false)
  })

  it('rejects empty password', () => {
    expect(signupSchema.safeParse({ ...valid, password: '' }).success).toBe(false)
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
    expect(loginSchema.safeParse({ ...valid, email: 'bad' }).success).toBe(false)
  })

  it('accepts a single-character password (login does not enforce min length like signup)', () => {
    // Intentional: the backend relies on Supabase for credential verification.
    // Minimum-length enforcement at login would reject legacy short passwords.
    expect(loginSchema.safeParse({ ...valid, password: 'x' }).success).toBe(true)
  })

  it('rejects empty password', () => {
    expect(loginSchema.safeParse({ ...valid, password: '' }).success).toBe(false)
  })

  it('rejects empty email', () => {
    expect(loginSchema.safeParse({ ...valid, email: '' }).success).toBe(false)
  })

  it('rejects missing fields', () => {
    expect(loginSchema.safeParse({}).success).toBe(false)
  })
})
