import { z } from 'zod'

export const getNotificationsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export const markReadSchema = z.object({
  notificationIds: z.array(z.string().cuid()).min(1).optional(),
  all: z.boolean().optional(),
}).refine(
  (v) => v.all === true || (v.notificationIds && v.notificationIds.length > 0),
  { message: 'Provide notificationIds or all: true' }
)
