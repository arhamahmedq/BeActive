import { z } from 'zod'

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB

export const signUploadSchema = z.object({
  mimeType: z.enum(ALLOWED_MIME_TYPES, {
    message: 'File type must be image/jpeg, image/png, or image/webp',
  }),
  fileSize: z
    .number()
    .int('fileSize must be an integer')
    .positive('fileSize must be positive')
    .max(MAX_FILE_SIZE_BYTES, 'File too large — maximum size is 10 MB'),
  // Which storage prefix to sign for. 'post' (default) → posts/, 'avatar' → avatars/.
  kind: z.enum(['post', 'avatar']).default('post'),
})

export const createPostSchema = z.object({
  imageKey: z
    .string()
    .min(1, 'Image key is required')
    .max(500, 'Image key too long'),
  caption: z.string().max(500, 'Caption cannot exceed 500 characters').optional(),
})

export type SignUploadSchemaInput = z.infer<typeof signUploadSchema>
export type CreatePostSchemaInput = z.infer<typeof createPostSchema>
