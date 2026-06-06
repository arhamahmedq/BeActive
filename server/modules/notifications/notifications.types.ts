import type { NotificationType } from '@prisma/client'
import type { NotificationItem, NotificationsResponse, MarkReadResponse } from '../../../shared/types/notifications'

export type { NotificationItem, NotificationsResponse, MarkReadResponse }

export interface NotificationRow {
  id: string
  type: NotificationType
  title: string
  body: string | null
  data: unknown
  read: boolean
  createdAt: Date
}

export interface GetNotificationsParams {
  cursor: { createdAt: Date; id: string } | null
  limit: number
}

export interface MarkReadParams {
  notificationIds?: string[]
  all?: boolean
}
