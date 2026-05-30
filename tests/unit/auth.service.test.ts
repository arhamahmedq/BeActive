import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock all external dependencies before any imports of the module under test.
// The path must match what auth.service.ts imports — it uses './auth.repo' which
// resolves to the absolute path below (vitest resolves relative to the file being tested).
vi.mock('../../server/modules/auth/auth.repo', () => ({
  findUserByUsername: vi.fn(),
  findUserById: vi.fn(),
  createUser: vi.fn(),
  createDefaultStreak: vi.fn(),
  createUserWithStreak: vi.fn(),
  persistEvent: vi.fn(),
  findUserByEmail: vi.fn(),
}))

// Mock the admin Supabase client so tests don't need real env vars
vi.mock('../../app/web/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({ error: null }),
      },
    },
  })),
}))

// Mock @/lib/events/types — resolves via vitest.config.ts alias
vi.mock('@/lib/events/types', () => ({
  EventType: {
    USER_SIGNED_UP: 'USER_SIGNED_UP',
    USER_LOGGED_IN: 'USER_LOGGED_IN',
  },
}))

// Mock the logger so tests are silent
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
import { ConflictError, UnauthorizedError } from '../../server/core/errors/AppError'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSupabaseMock(overrides: Record<string, unknown> = {}) {
  return {
    auth: {
      signUp: vi.fn().mockResolvedValue({
        data: {
          user: { id: 'supabase-uuid-123', email: 'test@example.com' },
          session: { expires_at: Math.floor(Date.now() / 1000) + 3600 },
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
  activityState: 'ACTIVE',
  onboarded: false,
  createdAt: new Date(),
}

// ---------------------------------------------------------------------------
// signup
// ---------------------------------------------------------------------------

describe('authService.signup', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(authRepo.findUserByUsername).mockResolvedValue(null)
    vi.mocked(authRepo.createUserWithStreak).mockResolvedValue(mockUser)
    vi.mocked(authRepo.persistEvent).mockResolvedValue(undefined)
  })

  it('creates user and streak on successful signup', async () => {
    const supabase = makeSupabaseMock()
    const result = await authService.signup(supabase as never, {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    })

    expect(authRepo.findUserByUsername).toHaveBeenCalledWith('testuser')
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password123',
    })
    expect(authRepo.createUserWithStreak).toHaveBeenCalledWith({
      id: 'supabase-uuid-123',
      email: 'test@example.com',
      username: 'testuser',
    })
    expect(result.user.id).toBe('supabase-uuid-123')
    expect(result.session.userId).toBe('supabase-uuid-123')
  })

  it('throws ConflictError if username is taken', async () => {
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

  it('throws ConflictError if Supabase returns already registered error', async () => {
    vi.mocked(authRepo.findUserByUsername).mockResolvedValue(null)
    const supabase = makeSupabaseMock({
      signUp: vi.fn().mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'User already registered', status: 400 },
      }),
    })

    await expect(
      authService.signup(supabase as never, {
        email: 'taken@example.com',
        username: 'newuser',
        password: 'password123',
      })
    ).rejects.toThrow(ConflictError)
  })

  it('returns session with correct userId', async () => {
    const supabase = makeSupabaseMock()
    const result = await authService.signup(supabase as never, {
      email: 'test@example.com',
      username: 'testuser',
      password: 'password123',
    })

    expect(result.session.userId).toBe('supabase-uuid-123')
    expect(typeof result.session.expiresAt).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// login
// ---------------------------------------------------------------------------

describe('authService.login', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  it('returns session with correct userId', async () => {
    const supabase = makeSupabaseMock()
    const result = await authService.login(supabase as never, {
      email: 'test@example.com',
      password: 'password123',
    })

    expect(result.session.userId).toBe('supabase-uuid-123')
    expect(typeof result.session.expiresAt).toBe('string')
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

  it('returns null when no session', async () => {
    const supabase = makeSupabaseMock({
      getUser: vi.fn().mockResolvedValue({
        data: { user: null },
        error: { message: 'No session' },
      }),
    })
    const user = await authService.getSession(supabase as never)
    expect(user).toBeNull()
  })
})
