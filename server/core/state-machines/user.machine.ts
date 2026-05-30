import { UserActivityState } from '@prisma/client'

// Valid transitions for user activity state
const VALID_TRANSITIONS: Record<UserActivityState, UserActivityState[]> = {
  ACTIVE: ['ACTIVE', 'AT_RISK'],
  AT_RISK: ['ACTIVE', 'BROKEN'],
  BROKEN: ['ACTIVE'],
}

export function isValidUserTransition(
  from: UserActivityState,
  to: UserActivityState
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// Stub: actual transition logic implemented in Slice 4
export function transitionUserState(
  _currentState: UserActivityState,
  _nextState: UserActivityState
): void {
  throw new Error('User state machine not yet implemented — coming in Slice 4')
}
