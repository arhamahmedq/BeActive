import { FriendshipStatus } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'

export async function getAcceptedFriendIds(userId: string): Promise<string[]> {
  const rows = await prisma.friendship.findMany({
    where: {
      status: FriendshipStatus.ACCEPTED,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
    select: { userAId: true, userBId: true },
  })
  const ids = new Set<string>()
  for (const r of rows) ids.add(r.userAId === userId ? r.userBId : r.userAId)
  ids.delete(userId) // belt-and-suspenders: never include self
  return [...ids]
}
