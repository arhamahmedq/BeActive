import { StreakStatus } from '@prisma/client'

const VALID_TRANSITIONS: Record<StreakStatus, StreakStatus[]> = {
  INACTIVE: ['ACTIVE'],
  ACTIVE: ['ACTIVE', 'BROKEN'],
  BROKEN: ['ACTIVE'],
}

export function isValidStreakTransition(from: StreakStatus, to: StreakStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// Stub: actual transition logic implemented in Slice 4
export function transitionStreakState(_currentState: StreakStatus, _nextState: StreakStatus): void {
  throw new Error('Streak state machine not yet implemented — coming in Slice 4')
}
