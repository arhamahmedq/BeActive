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
  // Avatar: the R2 key returned by the (kind:'avatar') sign upload. A string sets
  // the picture; null removes it; undefined leaves it unchanged. The server
  // validates ownership and derives the public URL — clients never send a URL.
  avatarKey: z
    .string()
    .max(500, 'Avatar key too long')
    .nullable()
    .optional(),
})

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

// Query params for GET /api/users/[username]/posts (Slice 8A).
export const profilePostsQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(30).default(20),
})

export type ProfilePostsQueryInput = z.infer<typeof profilePostsQuerySchema>
