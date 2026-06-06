import type { SupabaseClient } from '@supabase/supabase-js'
import { Prisma } from '@prisma/client'
import {
  ConflictError,
  UnauthorizedError,
  InternalError,
  EmailNotVerifiedError,
} from '../../core/errors/AppError'
import { logger } from '../../core/logger/index'
import { EventType } from '../../core/events/index'
import {
  createUserWithStreak,
  findUserByUsername,
  findUserById,
  persistEvent,
} from './auth.repo'
import type {
  SignupInput,
  LoginInput,
  AuthUser,
  SignupStatusResult,
  LoginResult,
} from './auth.types'

// Checks for a Prisma unique constraint violation (P2002). Uses typed check
// when available; falls back to message string for plain Error wrappers (tests).
function isP2002Error(err: unknown): boolean {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    return err.code === 'P2002'
  }
  return err instanceof Error && err.message.includes('P2002')
}

export async function signup(
  supabase: SupabaseClient,
  input: SignupInput
): Promise<SignupStatusResult> {
  const normalizedEmail = input.email.toLowerCase()

  // Check username availability — email conflict is caught by Supabase below
  const existingByUsername = await findUserByUsername(input.username)
  if (existingByUsername) {
    throw new ConflictError('Username is already taken')
  }

  // Store username in metadata so the callback can create the Prisma record
  // after email verification. No Prisma write happens here.
  // emailRedirectTo must be explicit — without it, Supabase uses the project's
  // Site URL, making the callback destination environment-config-dependent.
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: input.password,
    options: {
      data: { username: input.username },
      emailRedirectTo: `${appUrl}/api/auth/callback`,
    },
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      // Suppress verified-email conflict to prevent email enumeration — the
      // caller cannot tell whether the email is new or already registered.
      logger.info('Signup suppressed for existing verified email', {})
      return { status: 'PENDING_VERIFICATION' }
    }
    logger.error('Supabase signUp error', { errorStatus: error.status, errorName: error.name })
    throw new InternalError()
  }

  // Supabase returns an empty identities array when the email already exists
  // but is unverified — it silently resends the confirmation email in this case.
  if (data.user?.identities?.length === 0) {
    logger.info('Signup resent for unverified account', {})
    return { status: 'VERIFICATION_RESENT' }
  }

  if (!data.user) {
    logger.error('Supabase signUp returned no user and no error', {})
    throw new InternalError()
  }

  logger.info('Signup initiated — pending email verification', { userId: data.user.id })
  return { status: 'PENDING_VERIFICATION' }
}

export async function createUserOnVerification(
  userId: string,
  email: string,
  username: string
): Promise<AuthUser> {
  // Idempotency: safe to call multiple times (re-click of confirmation link).
  const existing = await findUserById(userId)
  if (existing) {
    logger.info('User already exists on verification callback — returning existing', { userId })
    return existing
  }

  let user: AuthUser
  try {
    user = await createUserWithStreak({ id: userId, email, username })
  } catch (err) {
    if (isP2002Error(err)) {
      // Check whether the conflict is on the primary key (userId) — meaning a
      // concurrent request just created the same user. If so, return that user.
      const concurrent = await findUserById(userId)
      if (concurrent) {
        const target =
          err instanceof Prisma.PrismaClientKnownRequestError
            ? String(err.meta?.target ?? 'unknown')
            : 'unknown'
        logger.info('Concurrent user creation resolved', { userId, conflictField: target })
        return concurrent
      }
      // Conflict is on a different unique field (e.g., username) — throw a
      // typed ConflictError so the caller doesn't need to parse DB error codes.
      throw new ConflictError('Username is already taken')
    }
    throw err
  }

  // Fire-and-forget: event persistence failure must not block account creation.
  void persistEvent({
    type: EventType.USER_SIGNED_UP,
    userId: user.id,
    payload: { userId: user.id, username: user.username },
    source: 'auth.callback',
  }).catch((err: unknown) => {
    logger.error('Failed to persist USER_SIGNED_UP event', { error: String(err) })
  })

  logger.info('User created after email verification', { userId: user.id })
  return user
}

export async function resendVerification(
  supabase: SupabaseClient,
  email: string
): Promise<void> {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '')
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.toLowerCase(),
    options: { emailRedirectTo: `${appUrl}/api/auth/callback` },
  })
  if (error) {
    // Swallow — must not reveal whether the email exists in our system
    logger.error('Supabase resend error', { errorName: error.name })
  }
}

export async function login(
  supabase: SupabaseClient,
  input: LoginInput
): Promise<LoginResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })

  if (error || !data.user) {
    if (error?.message.toLowerCase().includes('not confirmed')) {
      throw new EmailNotVerifiedError()
    }
    throw new UnauthorizedError()
  }

  let user = await findUserById(data.user.id)
  if (!user) {
    // Recovery path: Supabase auth user exists but Prisma record doesn't.
    // This happens when the callback's DB write failed (transient error, cold-start
    // race, etc.) but Supabase already confirmed the email. Attempt lazy creation
    // so the user is not permanently locked out.
    const username = data.user.user_metadata?.username as string | undefined
    if (username) {
      try {
        logger.info('Attempting lazy user creation on login — callback may have failed', {
          supabaseId: data.user.id,
        })
        user = await createUserOnVerification(data.user.id, data.user.email!, username)
      } catch (recoveryErr) {
        logger.error('Lazy user creation on login failed', {
          supabaseId: data.user.id,
          error: String(recoveryErr),
        })
      }
    }
    if (!user) {
      logger.error('Auth user has no Prisma record and recovery failed', {
        supabaseId: data.user.id,
      })
      throw new InternalError()
    }
  }

  // Fire-and-forget: event log failure must not block login.
  void persistEvent({
    type: EventType.USER_LOGGED_IN,
    userId: user.id,
    payload: { userId: user.id },
    source: 'auth.service',
  }).catch((err: unknown) => {
    logger.error('Failed to persist USER_LOGGED_IN event', { error: String(err) })
  })

  logger.info('User logged in', { userId: user.id })

  return {
    user,
    session: {
      expiresAt: data.session?.expires_at
        ? new Date(data.session.expires_at * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(),
      userId: user.id,
    },
  }
}

export async function logout(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) {
    logger.error('Supabase signOut error', { errorName: error.name })
    throw new InternalError()
  }
  logger.info('User logged out', {})
}

export async function getSession(supabase: SupabaseClient): Promise<AuthUser | null> {
  // getSession() reads the JWT from the HTTP-only cookie without a network call.
  // Same rationale as requireAuth() — see server/core/middleware/auth.ts.
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session?.user) return null

  const prismaUser = await findUserById(session.user.id)
  return prismaUser
}
