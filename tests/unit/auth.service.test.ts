import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../server/modules/auth/auth.repo', () => ({
  findUserByUsername: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  createDefaultStreak: vi.fn(),
  createUserWithStreak: vi.fn(),
  persistEvent: vi.fn(),
  findUserByEmail: vi.fn(),
}))

vi.mock('@/lib/events/types', () => ({
  EventType: {
    USER_SIGNED_UP: 'USER_SIGNED_UP',
    USER_LOGGED_IN: 'USER_LOGGED_IN',
  },
}))

vi.mock('../../server/core/logger/index', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}))

import * as authRepo from '../../server/modules/auth/auth.repo'
import * as authService from '../../server/modules/auth/auth.service'
import { ConflictError, UnauthorizedError, EmailNotVerifiedError } from '../../server/core/errors/AppError'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'supabase-uuid-123',
            email: 'test@example.com',
            identities: [{ id: 'supabase-uuid-123' }],
          },
          session: null, // No session until email confirmed
        },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: { id: 'supabase-uuid-123' },
          session: { expires_at: Math.floor(Date.now() / 1000) + 3600 },
        },
        error: null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'supabase-uuid-123' } },
        error: null,
      }),
      resend: vi.fn().mockResolvedValue({ error: null }),
      ...overrides,
    },
  }
}

const mockUser = {
  id: 'supabase-uuid-123',
  email: 'test@example.com',
  username: 'testuser',
  displayName: null,
  avatarUrl: null,
  onboarded: false,
  createdAt: new Date(),
}

// ---------------------------------------------------------------------------
// signup
// ---------------------------------------------------------------------------

describe('authService.signup', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(authRepo.findUserByUsername).mockResolvedValue(null)
    vi.mocked(authRepo.persistEvent).mockResolvedValue(undefined)
  })

  it('returns PENDING_VERIFICATION for a new user', async () => {
    const supabase = makeSupabaseMock()
    const result = await authService.signup(supabase as never, {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    })

    expect(result.status).toBe('PENDING_VERIFICATION')
  })

  it('does NOT create a Prisma user during signup', async () => {
    const supabase = makeSupabaseMock()
    await authService.signup(supabase as never, {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    })

    expect(authRepo.createUserWithStreak).not.toHaveBeenCalled()
  })

  it('stores username in Supabase user metadata', async () => {
    const supabase = makeSupabaseMock()
    await authService.signup(supabase as never, {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    })

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
      options: {
        data: { username: 'testuser' },
        emailRedirectTo: 'http://localhost:3000/api/auth/callback',
      },
    })
  })

  it('returns VERIFICATION_RESENT for duplicate unverified email (identities empty)', async () => {
    const supabase = makeSupabaseMock({
      signUp: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'supabase-uuid-123',
            email: 'test@example.com',
            identities: [],
          },
          session: null,
        },
        error: null,
      }),
    })

    const result = await authService.signup(supabase as never, {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    })

    expect(result.status).toBe('VERIFICATION_RESENT')
    expect(authRepo.createUserWithStreak).not.toHaveBeenCalled()
  })

  it('normalizes email to lowercase before signup', async () => {
    const supabase = makeSupabaseMock()
    await authService.signup(supabase as never, {
      email: 'TEST@EXAMPLE.COM',
      username: 'testuser',
      password: 'password123',
    })

    expect(supabase.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com' })
    )
  })

  it('throws ConflictError if username is already taken', async () => {
    vi.mocked(authRepo.findUserByUsername).mockResolvedValue(mockUser)
    const supabase = makeSupabaseMock()

    await expect(
      authService.signup(supabase as never, {
        email: 'new@example.com',
        username: 'testuser',
        password: 'password123',
      })
    ).rejects.toThrow(ConflictError)
  })

  it('returns PENDING_VERIFICATION for already-registered email (suppresses enumeration)', async () => {
    // The "already registered" response from Supabase is suppressed to prevent
    // an attacker from learning whether an email is registered in our system.
    const supabase = makeSupabaseMock({
      signUp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered', status: 400 },
      }),
    })

    const result = await authService.signup(supabase as never, {
      email: 'taken@example.com',
      username: 'newuser',
      password: 'password123',
    })

    expect(result.status).toBe('PENDING_VERIFICATION')
    expect(authRepo.createUserWithStreak).not.toHaveBeenCalled()
  })

  it('throws InternalError when Supabase signUp returns an unexpected non-conflict error', async () => {
    const supabase = makeSupabaseMock({
      signUp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Something went wrong', status: 500 },
      }),
    })

    await expect(
      authService.signup(supabase as never, {
        email: 'test@example.com',
        username: 'newuser',
        password: 'password123',
      })
    ).rejects.toThrow('An unexpected error occurred')
  })

  it('throws InternalError when Supabase signUp returns no user and no error', async () => {
    const supabase = makeSupabaseMock({
      signUp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: null,
      }),
    })

    await expect(
      authService.signup(supabase as never, {
        email: 'test@example.com',
        username: 'newuser',
        password: 'password123',
      })
    ).rejects.toThrow('An unexpected error occurred')
  })
})

// ---------------------------------------------------------------------------
// createUserOnVerification
// ---------------------------------------------------------------------------

describe('authService.createUserOnVerification', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(authRepo.findUserById).mockResolvedValue(null)
    vi.mocked(authRepo.createUserWithStreak).mockResolvedValue(mockUser)
    vi.mocked(authRepo.persistEvent).mockResolvedValue(undefined)
  })

  it('creates Prisma user and streak on first verification', async () => {
    const user = await authService.createUserOnVerification(
      'supabase-uuid-123',
      'test@example.com',
      'testuser'
    )

    expect(authRepo.createUserWithStreak).toHaveBeenCalledWith({
      id: 'supabase-uuid-123',
      email: 'test@example.com',
      username: 'testuser',
    })
    expect(user.id).toBe('supabase-uuid-123')
  })

  it('is idempotent — returns existing user on re-verification without creating again', async () => {
    vi.mocked(authRepo.findUserById).mockResolvedValue(mockUser)

    const user = await authService.createUserOnVerification(
      'supabase-uuid-123',
      'test@example.com',
      'testuser'
    )

    expect(authRepo.createUserWithStreak).not.toHaveBeenCalled()
    expect(user.id).toBe('supabase-uuid-123')
  })

  it('persists USER_SIGNED_UP event after creating user', async () => {
    await authService.createUserOnVerification(
      'supabase-uuid-123',
      'test@example.com',
      'testuser'
    )

    expect(authRepo.persistEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'USER_SIGNED_UP',
        userId: 'supabase-uuid-123',
        source: 'auth.callback',
      })
    )
  })

  it('does NOT persist event if user already exists', async () => {
    vi.mocked(authRepo.findUserById).mockResolvedValue(mockUser)

    await authService.createUserOnVerification(
      'supabase-uuid-123',
      'test@example.com',
      'testuser'
    )

    expect(authRepo.persistEvent).not.toHaveBeenCalled()
  })

  it('still returns the created user when persistEvent fails (non-fatal)', async () => {
    vi.mocked(authRepo.persistEvent).mockRejectedValue(new Error('DB connection lost'))

    const user = await authService.createUserOnVerification(
      'supabase-uuid-123',
      'test@example.com',
      'testuser'
    )

    // User creation must succeed even when event logging fails
    expect(user.id).toBe('supabase-uuid-123')
  })

  it('resolves concurrent P2002 on id — returns existing user instead of throwing', async () => {
    // Simulate: findUserById returns null (user doesn't exist yet), then createUserWithStreak
    // throws P2002 (concurrent request created it), then second findUserById returns the user.
    vi.mocked(authRepo.findUserById)
      .mockResolvedValueOnce(null)    // first check: not found
      .mockResolvedValueOnce(mockUser) // after P2002: found (concurrent creation)
    vi.mocked(authRepo.createUserWithStreak).mockRejectedValueOnce(
      new Error('Unique constraint failed on the fields: (`id`) — P2002')
    )

    const user = await authService.createUserOnVerification(
      'supabase-uuid-123',
      'test@example.com',
      'testuser'
    )

    expect(user.id).toBe('supabase-uuid-123')
    expect(authRepo.createUserWithStreak).toHaveBeenCalledTimes(1)
  })

  it('throws ConflictError when username is taken by another user (not concurrent id collision)', async () => {
    // findUserById returns null both times — meaning the conflict is on `username`,
    // not `id`. The service must throw a typed ConflictError (not raw P2002).
    vi.mocked(authRepo.findUserById)
      .mockResolvedValueOnce(null) // first idempotency check: user not found
      .mockResolvedValueOnce(null) // after P2002: still not found (username race)
    vi.mocked(authRepo.createUserWithStreak).mockRejectedValueOnce(
      new Error('Unique constraint failed on the fields: (`username`) — P2002')
    )

    await expect(
      authService.createUserOnVerification(
        'supabase-uuid-123',
        'test@example.com',
        'takenusername'
      )
    ).rejects.toThrow(ConflictError)
  })
})

// ---------------------------------------------------------------------------
// resendVerification
// ---------------------------------------------------------------------------

describe('authService.resendVerification', () => {
  it('calls supabase.auth.resend with correct type and lowercased email', async () => {
    const supabase = makeSupabaseMock()
    await authService.resendVerification(supabase as never, 'TEST@EXAMPLE.COM')

    expect(supabase.auth.resend).toHaveBeenCalledWith({
      type: 'signup',
      email: 'test@example.com',
      options: { emailRedirectTo: 'http://localhost:3000/api/auth/callback' },
    })
  })

  it('does not throw if Supabase resend returns an error', async () => {
    const supabase = makeSupabaseMock({
      resend: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Rate limit exceeded' },
      }),
    })

    await expect(
      authService.resendVerification(supabase as never, 'test@example.com')
    ).resolves.not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// login (unchanged behavior)
// ---------------------------------------------------------------------------

describe('authService.login', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(authRepo.findUserById).mockResolvedValue(mockUser)
    vi.mocked(authRepo.persistEvent).mockResolvedValue(undefined)
  })

  it('returns user and session on valid credentials', async () => {
    const supabase = makeSupabaseMock()
    const result = await authService.login(supabase as never, {
      email: 'test@example.com',
      password: 'password123',
    })

    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    })
    expect(result.user.id).toBe('supabase-uuid-123')
  })

  it('throws UnauthorizedError on invalid credentials', async () => {
    const supabase = makeSupabaseMock({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid login credentials', status: 400 },
      }),
    })

    await expect(
      authService.login(supabase as never, {
        email: 'test@example.com',
        password: 'wrongpassword',
      })
    ).rejects.toThrow(UnauthorizedError)
  })

  it('throws EmailNotVerifiedError when Supabase reports email not confirmed', async () => {
    const supabase = makeSupabaseMock({
      signInWithPassword: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Email not confirmed', status: 400 },
      }),
    })

    await expect(
      authService.login(supabase as never, {
        email: 'unverified@example.com',
        password: 'password123',
      })
    ).rejects.toThrow(EmailNotVerifiedError)
  })

  it('returns session with correct userId and ISO expiresAt', async () => {
    const supabase = makeSupabaseMock()
    const result = await authService.login(supabase as never, {
      email: 'test@example.com',
      password: 'password123',
    })

    expect(result.session.userId).toBe('supabase-uuid-123')
    expect(typeof result.session.expiresAt).toBe('string')
  })

  it('still succeeds when persistEvent fails during login (non-fatal)', async () => {
    vi.mocked(authRepo.persistEvent).mockRejectedValue(new Error('DB connection lost'))
    const supabase = makeSupabaseMock()

    const result = await authService.login(supabase as never, {
      email: 'test@example.com',
      password: 'password123',
    })

    expect(result.user.id).toBe('supabase-uuid-123')
  })

  it('throws InternalError when login succeeds but Prisma has no user record and recovery fails', async () => {
    vi.mocked(authRepo.findUserById).mockResolvedValue(null)
    vi.mocked(authRepo.createUserWithStreak).mockRejectedValue(new Error('DB down'))

    const supabase = makeSupabaseMock({
      // user_metadata has no username, so recovery cannot be attempted
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {
          user: { id: 'supabase-uuid-123', email: 'test@example.com', user_metadata: {} },
          session: { expires_at: Math.floor(Date.now() / 1000) + 3600 },
        },
        error: null,
      }),
    })

    await expect(
      authService.login(supabase as never, {
        email: 'test@example.com',
        password: 'password123',
      })
    ).rejects.toThrow('An unexpected error occurred')
  })
})

// ---------------------------------------------------------------------------
// logout
// ---------------------------------------------------------------------------

describe('authService.logout', () => {
  it('calls supabase.auth.signOut', async () => {
    const supabase = makeSupabaseMock()
    await authService.logout(supabase as never)
    expect(supabase.auth.signOut).toHaveBeenCalled()
  })

  it('throws InternalError when Supabase signOut returns an error', async () => {
    const supabase = makeSupabaseMock({
      signOut: vi.fn().mockResolvedValue({ error: { message: 'Network error', name: 'AuthError' } }),
    })
    await expect(authService.logout(supabase as never)).rejects.toThrow('An unexpected error occurred')
  })
})

// ---------------------------------------------------------------------------
// getSession
// ---------------------------------------------------------------------------

describe('authService.getSession', () => {
  beforeEach(() => {
    vi.mocked(authRepo.findUserById).mockResolvedValue(mockUser)
  })

  it('returns user when session is valid', async () => {
    const supabase = makeSupabaseMock()
    const user = await authService.getSession(supabase as never)
    expect(user).not.toBeNull()
    expect(user?.id).toBe('supabase-uuid-123')
  })

  it('returns null when no active session', async () => {
    const supabase = makeSupabaseMock({
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'No session' },
      }),
    })
    const user = await authService.getSession(supabase as never)
    expect(user).toBeNull()
  })

  it('returns null when Supabase user exists but Prisma record is missing (orphaned auth user)', async () => {
    vi.mocked(authRepo.findUserById).mockResolvedValue(null)
    const supabase = makeSupabaseMock()
    const user = await authService.getSession(supabase as never)
    expect(user).toBeNull()
  })
})
