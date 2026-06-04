import { z } from 'zod'
import { isValidIANATimezone } from '../../../shared/utils/timezone'

export const updateProfileSchema = z.object({
  displayName: z
    .string()
    .max(50, 'Display name must be at most 50 characters')
    .nullable()
    .optional(),
  timezone: z
    .string()
    .refine(isValidIANATimezone, { message: 'Must be a valid IANA timezone (e.g. America/New_York)' })
    .optional(),
  bio: z
    .string()
    .max(160, 'Bio must be at most 160 characters')
    .nullable()
    .optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
