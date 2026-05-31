import { UserActivityState } from '@prisma/client'
import { updateUserActivityState } from './users.repo'

export async function setActivityState(
  userId: string,
  state: UserActivityState
): Promise<void> {
  await updateUserActivityState(userId, state)
}
