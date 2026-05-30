import { PostStatus } from '@prisma/client'

const VALID_TRANSITIONS: Record<PostStatus, PostStatus[]> = {
  PENDING: ['VERIFIED', 'REJECTED'],
  VERIFIED: [],
  REJECTED: ['PENDING'],
}

export function isValidWorkoutTransition(from: PostStatus, to: PostStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

// Stub: actual transition logic implemented in Slice 3
export function transitionWorkoutState(_currentState: PostStatus, _nextState: PostStatus): void {
  throw new Error('Workout state machine not yet implemented — coming in Slice 3')
}
