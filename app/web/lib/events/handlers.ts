import { eventBus } from './bus'
import { EventType } from './types'
import type { DomainEvent } from './types'

// Handler registry — each handler registered here in later slices
// Slice 0: infrastructure only, no business handlers registered yet

function onUserSignedUp(_event: DomainEvent): void {
  // Slice 1: create default streak, send welcome notification
}

function onWorkoutVerified(_event: DomainEvent): void {
  // Slice 3+4: trigger rule engine → streak update → feed post
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
