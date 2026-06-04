import { z } from 'zod'

export const requestFriendSchema = z.object({
  targetUserId: z.string().min(1, 'targetUserId is required'),
})

export const acceptFriendSchema = z.object({
  friendshipId: z.string().min(1, 'friendshipId is required'),
})

export const rejectFriendSchema = z.object({
  friendshipId: z.string().min(1, 'friendshipId is required'),
})

export const removeFriendSchema = z.object({
  friendshipId: z.string().min(1, 'friendshipId is required'),
})

export const searchUsersSchema = z.object({
  // max(50) runs BEFORE transform to reject oversized payloads immediately.
  // transform: trim whitespace, NFKC-normalize (collapses Unicode lookalikes),
  //            then strip SQL LIKE wildcard chars (%, _, \) to prevent injection
  //            via Prisma's contains/ILIKE operator.
  // min(2) runs AFTER transform — rejects whitespace-only and wildcard-only queries.
  q: z.string()
    .max(50, 'Query too long')
    .transform((v) => v.trim().normalize('NFKC').replace(/[%_\\]/g, ''))
    .pipe(z.string().min(2, 'Query must be at least 2 characters')),
})

export type RequestFriendInput = z.infer<typeof requestFriendSchema>
export type AcceptFriendInput = z.infer<typeof acceptFriendSchema>
export type RejectFriendInput = z.infer<typeof rejectFriendSchema>
export type RemoveFriendInput = z.infer<typeof removeFriendSchema>
export type SearchUsersInput = z.infer<typeof searchUsersSchema>
