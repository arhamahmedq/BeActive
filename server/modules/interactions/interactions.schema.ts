import { z } from 'zod'

export const createCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Comment cannot be empty')
    .max(300, 'Comment must be at most 300 characters'),
})

export const commentsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export type CreateCommentInput = z.infer<typeof createCommentSchema>
export type CommentsQueryInput = z.infer<typeof commentsQuerySchema>
