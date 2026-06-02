import { NotFoundError } from '../../core/errors/AppError'
import { getUserById, updateUserProfile } from './users.repo'
import type { UserProfile, UpdateProfileInput } from './users.types'

export async function getProfile(userId: string): Promise<UserProfile> {
  const user = await getUserById(userId)
  if (!user) throw new NotFoundError('User')
  return user
}

export async function updateProfile(
  userId: string,
  input: UpdateProfileInput
): Promise<UserProfile> {
  const existing = await getUserById(userId)
  if (!existing) throw new NotFoundError('User')
  return updateUserProfile(userId, input)
}
