import type { StoryCardPlant } from './icons'

export type { StoryCardPlant }

// ---------------------------------------------------------------------------
// StoryPayload — the immutable snapshot frozen at WORKOUT_VERIFIED time.
// `renderStoryPng` is a pure function of this payload (plus the cached
// `storySrcKey` photo it points at): same payload in -> same PNG out, with
// zero live DB lookups and zero external network calls.
// ---------------------------------------------------------------------------
export interface StoryPayload {
  postId: string
  userId: string
  shareVersion: number
  /** R2 key of the pre-downscaled 936x620 cover photo (story-src/{postId}.webp). */
  storySrcKey: string
  username: string
  avatarUrl: string | null
  workoutType: string
  workoutLabel: string
  streakCount: number
  bestStreak: number
  isPersonalBest: boolean
  plant: StoryCardPlant
  plantName: string
  /** ISO timestamp — when this snapshot was taken. */
  createdAt: string
}
