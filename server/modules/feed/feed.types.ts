import type { Prisma } from '@prisma/client'

// Inferred directly from the Prisma select in getFeedCandidates.
// Using PostGetPayload keeps this type in sync with the schema automatically.
export type FeedCandidateRow = Prisma.PostGetPayload<{
  select: {
    id: true
    imageUrl: true
    caption: true
    createdAt: true
    user: {
      select: {
        id: true
        username: true
        avatarUrl: true
        streak: { select: { current: true } }
      }
    }
    workout: { select: { type: true } }
  }
}>
