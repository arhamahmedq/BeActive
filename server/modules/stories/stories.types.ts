import type { StoryStatus } from '@prisma/client'
import type { StoryPayload, StoryCardPlant } from '@/lib/story-card/types'

export type { StoryPayload, StoryCardPlant }

export interface StoryRow {
  id: string
  postId: string
  userId: string
  payload: StoryPayload
  shareVersion: number
  status: StoryStatus
  assetKey: string | null
  assetUrl: string | null
}
