// Pure fetch wrappers for the Notifications API — no React logic.
import type { NotificationsResponse, MarkReadResponse } from '@/shared/types/notifications'

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code?: string
  ) {
    super(`API error ${status}`)
  }
}

async function apiFetch(input: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init)
  if (!res.ok) {
    let code: string | undefined
    try {
      const body = await res.clone().json() as { error?: { code?: string } }
      code = body.error?.code
    } catch { /* ignore */ }
    throw new ApiError(res.status, code)
  }
  return res
}

export async function fetchNotifications(
  cursor?: string,
  limit = 20
): Promise<NotificationsResponse> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (cursor) params.set('cursor', cursor)
  const res = await apiFetch(`/api/notifications?${params}`)
  return res.json() as Promise<NotificationsResponse>
}

export async function markNotificationsRead(
  notificationIds?: string[],
  all?: boolean
): Promise<MarkReadResponse> {
  const res = await apiFetch('/api/notifications/read', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(all ? { all: true } : { notificationIds }),
  })
  return res.json() as Promise<MarkReadResponse>
}
