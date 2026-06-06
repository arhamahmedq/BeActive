export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  data: Record<string, unknown> | null
  read: boolean
  createdAt: string
}

export interface NotificationsResponse {
  notifications: NotificationItem[]
  unreadCount: number
  nextCursor: string | null
}

export interface MarkReadResponse {
  success: true
}
