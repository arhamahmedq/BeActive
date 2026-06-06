// Notifications repository — Prisma queries only, no business logic.
// Write path bootstrapped in Slice 6 Phase 4 for friend notifications.
// Read path (listNotifications, getUnreadCount, markNotificationsRead) added in Slice 7.

import { NotificationType, Prisma } from '@prisma/client'
import { prisma } from '../../../app/web/lib/prisma'
import type { NotificationRow } from './notifications.types'

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

// ---------------------------------------------------------------------------
// Read path — added Slice 7
// ---------------------------------------------------------------------------

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  data: true,
  read: true,
  createdAt: true,
} as const

// Keyset pagination on (createdAt DESC, id DESC). Returns up to limit+1 rows
// so the caller can detect whether a next page exists.
export async function listNotifications(
  userId: string,
  cursor: { createdAt: Date; id: string } | null,
  limit: number
): Promise<NotificationRow[]> {
  return prisma.notification.findMany({
    where: {
      userId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    select: NOTIFICATION_SELECT,
  }) as Promise<NotificationRow[]>
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, read: false } })
}

// Always scoped to userId — IDOR-safe.
// ids === null means mark ALL unread notifications as read for the user.
export async function markNotificationsRead(
  userId: string,
  ids: string[] | null
): Promise<void> {
  await prisma.notification.updateMany({
    where: {
      userId,
      read: false,
      ...(ids !== null ? { id: { in: ids } } : {}),
    },
    data: { read: true },
  })
}
