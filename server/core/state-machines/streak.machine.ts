import { StreakStatus } from '@prisma/client'

const VALID_TRANSITIONS: Record<StreakStatus, StreakStatus[]> = {
  INACTIVE: [StreakStatus.ACTIVE],
  ACTIVE: [StreakStatus.ACTIVE, StreakStatus.BROKEN],
  BROKEN: [StreakStatus.ACTIVE],
}

export function isValidStreakTransition(from: StreakStatus, to: StreakStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

interface StreakCounterState {
  current: number
  best: number
  status: StreakStatus
}

export function applyStreakTransition(
  state: StreakCounterState,
  to: StreakStatus
): StreakCounterState {
  if (!isValidStreakTransition(state.status, to)) {
    throw new Error(`Invalid streak transition: ${state.status} → ${to}`)
  }

  if (to === StreakStatus.BROKEN) {
    return { ...state, status: StreakStatus.BROKEN }
  }

  // to === ACTIVE
  const next = state.status === StreakStatus.ACTIVE ? state.current + 1 : 1
  return {
    current: next,
    best: Math.max(state.best, next),
    status: StreakStatus.ACTIVE,
  }
}
