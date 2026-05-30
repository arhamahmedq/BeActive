import type { SupabaseClient } from '@supabase/supabase-js'
import { ConflictError, UnauthorizedError, InternalError } from '../../core/errors/AppError'
import { logger } from '../../core/logger/index'
import { EventType } from '@/lib/events/types'
import {
  createUserWithStreak,
  findUserByUsername,
  findUserById,
  persistEvent,
} from './auth.repo'
import { createAdminClient } from '../../../app/web/lib/supabase/admin'
import type { SignupInput, LoginInput, AuthUser, SignupResult, LoginResult } from './auth.types'

export async function signup(
  supabase: SupabaseClient,
  input: SignupInput
): Promise<SignupResult> {
  const normalizedEmail = input.email.toLowerCase()

  // Check for existing username (email conflict caught by Supabase)
  const existingByUsername = await findUserByUsername(input.username)
  if (existingByUsername) {
    throw new ConflictError('Username is already taken')
  }

  // Create Supabase auth user
  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: input.password,
  })

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      throw new ConflictError('Email is already registered')
    }
    logger.error('Supabase signUp error', { error: error.message })
    throw new InternalError()
  }

  if (!data.user) {
    logger.error('Supabase signUp returned no user', {})
    throw new InternalError()
  }

  // Create Prisma user + streak in a single transaction
  let user: AuthUser
  try {
    user = await createUserWithStreak({
      id: data.user.id,
      email: normalizedEmail,
      username: input.username,
    })
  } catch (prismaErr) {
    // Compensate: delete the Supabase auth user to prevent orphaned accounts
    const adminClient = createAdminClient()
    await adminClient.auth.admin.deleteUser(data.user.id).catch((delErr) => {
      logger.error('Failed to rollback Supabase user after Prisma failure', {
        supabaseId: data.user!.id,
        error: String(delErr),
      })
    })

    // Check for unique constraint violation (P2002)
    if (
      prismaErr instanceof Error &&
      prismaErr.message.includes('P2002')
    ) {
      throw new ConflictError('Username or email is already taken')
    }

    logger.error('Prisma createUserWithStreak failed', { error: String(prismaErr) })
    throw new InternalError()
  }

  // Persist USER_SIGNED_UP event (append-only audit log)
  await persistEvent({
    type: EventType.USER_SIGNED_UP,
    userId: user.id,
    payload: { email: user.email, username: user.username },
    source: 'auth.service',
  }).catch((err: unknown) => {
    // Non-fatal: event persistence failure should not block signup
    logger.error('Failed to persist USER_SIGNED_UP event', { error: String(err) })
  })

  logger.info('User signed up', { userId: user.id, username: user.username })

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

export async function login(
  supabase: SupabaseClient,
  input: LoginInput
): Promise<LoginResult> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email,
    password: input.password,
  })

  if (error || !data.user) {
    throw new UnauthorizedError()
  }

  const user = await findUserById(data.user.id)
  if (!user) {
    // Auth user exists but no Prisma record — data inconsistency
    logger.error('Auth user has no Prisma record', { supabaseId: data.user.id })
    throw new InternalError()
  }

  // Persist USER_LOGGED_IN event
  await persistEvent({
    type: EventType.USER_LOGGED_IN,
    userId: user.id,
    payload: { email: user.email },
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
    logger.error('Supabase signOut error', { error: error.message })
    throw new InternalError()
  }
  logger.info('User logged out', {})
}

export async function getSession(supabase: SupabaseClient): Promise<AuthUser | null> {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null

  const prismaUser = await findUserById(user.id)
  return prismaUser
}
