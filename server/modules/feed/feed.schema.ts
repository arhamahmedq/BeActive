import { z } from 'zod'
import { FEED_MAX_LIMIT, FEED_DEFAULT_LIMIT } from '../../../shared/constants/index'

export const feedQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(FEED_MAX_LIMIT).default(FEED_DEFAULT_LIMIT),
})

export type FeedQueryInput = z.infer<typeof feedQuerySchema>
