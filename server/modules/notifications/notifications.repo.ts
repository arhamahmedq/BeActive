// Notifications repository — Prisma queries only, no business logic.
// Write path bootstrapped in Slice 6 Phase 4 for friend notifications.
// Read path (getNotifications, markRead) is implemented in Slice 7.

import { NotificationType, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'

export interface CreateNotificationParams {
  userId: string
  type: NotificationType
  title: string
  body?: string | null
  data?: Record<string, unknown>
  idempotencyKey?: string | null
}

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  const data = params.data !== undefined ? (params.data as Prisma.InputJsonValue) : undefined

  if (params.idempotencyKey) {
    // Upsert is a no-op on duplicate idempotencyKey — safe for retries and concurrent calls.
    await prisma.notification.upsert({
      where: { idempotencyKey: params.idempotencyKey },
      update: {},
      create: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        data,
        idempotencyKey: params.idempotencyKey,
      },
    })
  } else {
    // No idempotency key — plain create. Used when duplicate protection is not needed.
    await prisma.notification.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        data,
      },
    })
  }
}
