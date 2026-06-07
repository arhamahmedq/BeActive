import type { WorkoutType } from '@prisma/client'

export interface ClassificationInput {
  imageUrl: string
  postId: string
}

export interface ClassificationOutput {
  isWorkout: boolean
  type: WorkoutType
  confidence: number        // 0.00 – 1.00  (sum of all workout label scores)
  processingTimeMs: number
  modelVersion: string
}

export interface LabeledScore {
  label: string
  score: number
}

// Maps a CLIP label text to a WorkoutType; null = non-workout anchor label
export interface WorkoutLabel {
  text: string
  type: WorkoutType | null
}

export type ClassificationDecision = 'VERIFIED' | 'REJECTED'
