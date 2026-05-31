import { UserActivityState } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'

export async function updateUserActivityState(
  userId: string,
  state: UserActivityState
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { activityState: state },
  })
}
