import { z } from 'zod'

export const registerDeviceSchema = z.object({
  token: z.string().min(1, 'token is required').max(512, 'token too long'),
  platform: z.enum(['ios']).default('ios'),
})

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>
