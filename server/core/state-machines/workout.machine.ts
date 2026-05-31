import { PostStatus } from '@prisma/client'

const VALID_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  PENDING: [PostStatus.VERIFIED, PostStatus.REJECTED],
  VERIFIED: [],
  REJECTED: [PostStatus.PENDING],
}

export function isValidWorkoutTransition(from: PostStatus, to: PostStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function transitionWorkoutState(currentState: PostStatus, nextState: PostStatus): PostStatus {
  if (!isValidWorkoutTransition(currentState, nextState)) {
    throw new Error(
      `Invalid Post state transition: ${currentState} → ${nextState}`
    )
  }
  return nextState
}
