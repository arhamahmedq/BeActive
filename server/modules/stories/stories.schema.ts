import { z } from 'zod'

export const storyParamsSchema = z.object({
  postId: z.string().min(1, 'postId is required').max(100, 'postId too long'),
})

export type StoryParams = z.infer<typeof storyParamsSchema>

export const reportStorySharedSchema = z.object({
  method: z.enum(['web_share', 'download']),
})

export type ShareMethod = z.infer<typeof reportStorySharedSchema>['method']
