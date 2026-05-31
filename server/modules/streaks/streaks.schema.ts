import { z } from 'zod'

export const userIdParamSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
})
