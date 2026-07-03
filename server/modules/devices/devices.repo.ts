// Devices repository — Prisma queries only, no business logic.
import { prisma } from '../../../app/web/lib/prisma'

// Keyed by token (not userId+token) so a device reinstalled under a different
// account reassigns cleanly instead of leaving a stale row under the old user.
export async function upsertDeviceToken(userId: string, token: string, platform: string): Promise<void> {
  await prisma.deviceToken.upsert({
    where: { token },
    update: { userId, platform },
    create: { userId, token, platform },
  })
}

export async function getDeviceTokensForUser(userId: string): Promise<string[]> {
  const rows = await prisma.deviceToken.findMany({ where: { userId }, select: { token: true } })
  return rows.map((r) => r.token)
}

// Called when APNs reports a token as dead (410 / BadDeviceToken / Unregistered).
export async function deleteDeviceToken(token: string): Promise<void> {
  await prisma.deviceToken.deleteMany({ where: { token } })
}
