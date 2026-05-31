import { UserActivityState } from '@prisma/client'

// Valid transitions for user activity state
const VALID_TRANSITIONS: Record<UserActivityState, UserActivityState[]> = {
  ACTIVE: [UserActivityState.ACTIVE, UserActivityState.AT_RISK],
  AT_RISK: [UserActivityState.ACTIVE, UserActivityState.BROKEN],
  BROKEN: [UserActivityState.ACTIVE],
}

export function isValidUserTransition(
  from: UserActivityState,
  to: UserActivityState
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function assertUserTransition(
  from: UserActivityState,
  to: UserActivityState
): void {
  if (!isValidUserTransition(from, to)) {
    throw new Error(`Invalid user activity transition: ${from} → ${to}`)
  }
}
