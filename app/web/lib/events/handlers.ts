import { eventBus } from './bus'
import { EventType } from './types'
import type { DomainEvent } from './types'

// The event bus is for BEST-EFFORT, fan-out side effects only (notifications,
// feed cache invalidation). Must-happen state invariants are NOT wired here.
//
// In particular, the streak increment on WORKOUT_VERIFIED is intentionally a
// direct awaited call inside server/workers/aiClassifier.ts — NOT a bus handler.
// It has no reconciliation path, so it cannot depend on an in-memory listener
// being registered on this process instance. Do not move it onto the bus.

function onUserSignedUp(_event: DomainEvent): void {
  // Slice 7: send welcome notification
}

function onWorkoutVerified(_event: DomainEvent): void {
  // Streak update happens directly in aiClassifier (see note above).
  // Slice 5: feed.service.createFeedPost(event)
  // Slice 7: notifications.service.notifyFriends(event)
}

function onStreakAtRisk(_event: DomainEvent): void {
  // Slice 7: dispatch urgent notification
}

function onStreakBroken(_event: DomainEvent): void {
  // Slice 7: dispatch notification
}

export function registerEventHandlers(): void {
  eventBus.on(EventType.USER_SIGNED_UP, onUserSignedUp)
  eventBus.on(EventType.WORKOUT_VERIFIED, onWorkoutVerified)
  eventBus.on(EventType.STREAK_AT_RISK, onStreakAtRisk)
  eventBus.on(EventType.STREAK_BROKEN, onStreakBroken)
}
