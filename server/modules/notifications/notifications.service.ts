// Notifications service — business logic, event emission.
// Write path bootstrapped in Slice 6 Phase 4 for friend notifications.
// Full read path (getNotifications, markRead) added in Slice 7.

import {
  createNotification as repoCreateNotification,
  listNotifications,
  getUnreadCount,
  markNotificationsRead,
} from './notifications.repo'
import type { CreateNotificationParams } from './notifications.repo'
import type { NotificationsResponse, MarkReadParams } from './notifications.types'
import { getDeviceTokensForUser, deleteDeviceToken } from '../devices/devices.repo'
import { sendPush } from '../../../app/web/lib/push/apns'
import { logger } from '../../core/logger/index'

export type { CreateNotificationParams }

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  await repoCreateNotification(params)
  // Awaited (not detached) so it isn't abandoned if the caller's serverless
  // invocation returns right after this resolves — same reasoning as the
  // notification write itself (see CLAUDE.md §18). Never throws: a push
  // failure must not fail the notification write that already succeeded.
  await sendPushForNotification(params)
}

async function sendPushForNotification(params: CreateNotificationParams): Promise<void> {
  try {
    const tokens = await getDeviceTokensForUser(params.userId)
    if (tokens.length === 0) return

    const results = await Promise.all(
      tokens.map((token) => sendPush(token, { title: params.title, body: params.body, data: params.data }))
    )
    await Promise.all(
      results.map((result, i) => (result === 'invalid' ? deleteDeviceToken(tokens[i]!) : Promise.resolve()))
    )
  } catch (err) {
    logger.error('Push notification dispatch failed', { userId: params.userId, error: String(err) })
  }
}

// ---------------------------------------------------------------------------
// Read path
// ---------------------------------------------------------------------------

function encodeCursor(c: { createdAt: Date; id: string }): string {
  return Buffer.from(JSON.stringify({ c: c.createdAt.toISOString(), i: c.id })).toString('base64url')
}

function decodeCursor(raw: string | undefined): { createdAt: Date; id: string } | null {
  if (!raw) return null
  try {
    const o = JSON.parse(Buffer.from(raw, 'base64url').toString()) as { c: string; i: string }
    const createdAt = new Date(o.c)
    if (Number.isNaN(createdAt.getTime()) || typeof o.i !== 'string') return null
    return { createdAt, id: o.i }
  } catch {
    return null
  }
}

export async function getNotifications(
  userId: string,
  cursorRaw: string | undefined,
  limit: number
): Promise<NotificationsResponse> {
  const cursor = decodeCursor(cursorRaw)

  const [rows, unreadCount] = await Promise.all([
    listNotifications(userId, cursor, limit),
    getUnreadCount(userId),
  ])

  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  const nextCursor = hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null

  return {
    notifications: page.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data as Record<string, unknown> | null,
      read: n.read,
      createdAt: n.createdAt.toISOString(),
    })),
    unreadCount,
    nextCursor,
  }
}

export async function markRead(userId: string, params: MarkReadParams): Promise<void> {
  if (params.all) {
    await markNotificationsRead(userId, null)
  } else if (params.notificationIds && params.notificationIds.length > 0) {
    await markNotificationsRead(userId, params.notificationIds)
  }
}
