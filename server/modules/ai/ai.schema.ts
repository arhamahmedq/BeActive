import { z } from 'zod'

// Body of the QStash classification job — published by posts/create,
// consumed by /api/queue/classify. Mirrors processUploadedPost's param shape
// in server/workers/aiClassifier.ts.
export const classificationJobSchema = z.object({
  postId: z.string().min(1),
  imageUrl: z.string().min(1),
  userId: z.string().min(1),
  correlationId: z.string().optional(),
})

export type ClassificationJobInput = z.infer<typeof classificationJobSchema>
