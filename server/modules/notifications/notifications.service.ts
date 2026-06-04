// Notifications service — business logic, event emission.
// Write path bootstrapped in Slice 6 Phase 4 for friend notifications.
// Full read path (getNotifications, markRead, dispatcher) is implemented in Slice 7.

import { createNotification as repoCreateNotification } from './notifications.repo'
import type { CreateNotificationParams } from './notifications.repo'

export type { CreateNotificationParams }

export async function createNotification(params: CreateNotificationParams): Promise<void> {
  return repoCreateNotification(params)
}
